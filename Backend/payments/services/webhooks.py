from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from payments.models import Payment, StripeEvent
from reservations.models import Reservation


SUPPORTED_STRIPE_EVENT_TYPES = {
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
}


class StripeWebhookProcessingError(ValueError):
    pass


def _event_to_payload(event: Any) -> dict[str, Any]:
    if hasattr(event, "to_dict_recursive"):
        return event.to_dict_recursive()
    if isinstance(event, dict):
        return event
    return dict(event)


def _get_object_metadata(payment_intent: dict[str, Any]) -> dict[str, Any]:
    metadata = payment_intent.get("metadata") or {}
    return metadata if isinstance(metadata, dict) else {}


def _validate_payment_metadata(*, payment: Payment, metadata: dict[str, Any]) -> None:
    reservation_id = metadata.get("reservation_id")
    payment_id = metadata.get("payment_id")

    if reservation_id not in (None, "", str(payment.reservation_id)):
        raise StripeWebhookProcessingError("reservation_id metadata mismatch.")

    if payment_id not in (None, "", str(payment.id)):
        raise StripeWebhookProcessingError("payment_id metadata mismatch.")


def _update_reservation_after_payment(payment: Payment) -> None:
    reservation = payment.reservation
    if payment.status == Payment.Status.REUSSI:
        updates: list[str] = ["status", "updated_at"]
        reservation.status = Reservation.Status.CONFIRMEE
        if reservation.confirmed_at is None:
            reservation.confirmed_at = timezone.now()
            updates.append("confirmed_at")
        reservation.save(update_fields=updates)
        return

    if payment.status == Payment.Status.ECHOUE:
        reservation.status = Reservation.Status.PAIEMENT_ECHOUE
        reservation.save(update_fields=["status", "updated_at"])
        return

    if payment.status == Payment.Status.ANNULE and reservation.status == Reservation.Status.EN_ATTENTE_PAIEMENT:
        reservation.status = Reservation.Status.EN_ATTENTE_CAUTION
        reservation.save(update_fields=["status", "updated_at"])


def _apply_payment_intent_event(*, event_type: str, payment_intent: dict[str, Any]) -> None:
    stripe_payment_intent_id = payment_intent.get("id")
    if not stripe_payment_intent_id:
        raise StripeWebhookProcessingError("Missing payment intent id.")

    payment = (
        Payment.objects.select_for_update()
        .select_related("reservation")
        .filter(stripe_payment_intent_id=stripe_payment_intent_id)
        .first()
    )
    if payment is None:
        raise StripeWebhookProcessingError("Unknown payment intent.")

    metadata = _get_object_metadata(payment_intent)
    _validate_payment_metadata(payment=payment, metadata=metadata)

    if event_type == "payment_intent.succeeded":
        payment.status = Payment.Status.REUSSI
        payment.succeeded_at = timezone.now()
        payment.failed_at = None
        payment.cancelled_at = None
        payment.failure_code = None
        payment.failure_message = None
        payment.save(
            update_fields=[
                "status",
                "succeeded_at",
                "failed_at",
                "cancelled_at",
                "failure_code",
                "failure_message",
                "updated_at",
            ]
        )
        _update_reservation_after_payment(payment)
        return

    if event_type == "payment_intent.payment_failed":
        last_payment_error = payment_intent.get("last_payment_error") or {}
        payment.status = Payment.Status.ECHOUE
        payment.failed_at = timezone.now()
        payment.succeeded_at = None
        payment.cancelled_at = None
        payment.failure_code = last_payment_error.get("code")
        payment.failure_message = last_payment_error.get("message")
        payment.save(
            update_fields=[
                "status",
                "failed_at",
                "succeeded_at",
                "cancelled_at",
                "failure_code",
                "failure_message",
                "updated_at",
            ]
        )
        _update_reservation_after_payment(payment)
        return

    if event_type == "payment_intent.canceled":
        payment.status = Payment.Status.ANNULE
        payment.cancelled_at = timezone.now()
        payment.succeeded_at = None
        payment.failed_at = None
        payment.failure_code = payment_intent.get("cancellation_reason") or payment.failure_code
        payment.failure_message = None
        payment.save(
            update_fields=[
                "status",
                "cancelled_at",
                "succeeded_at",
                "failed_at",
                "failure_code",
                "failure_message",
                "updated_at",
            ]
        )
        _update_reservation_after_payment(payment)


def process_stripe_event(event: Any) -> StripeEvent:
    payload = _event_to_payload(event)
    stripe_event_id = payload.get("id")
    event_type = payload.get("type")

    if not stripe_event_id or not event_type:
        raise StripeWebhookProcessingError("Invalid Stripe event payload.")

    with transaction.atomic():
        try:
            StripeEvent.objects.create(
                stripe_event_id=stripe_event_id,
                event_type=event_type,
                api_version=payload.get("api_version"),
                payload=payload,
            )
        except IntegrityError:
            pass

        stripe_event = StripeEvent.objects.select_for_update().get(stripe_event_id=stripe_event_id)

        if stripe_event.processed:
            return stripe_event

        stripe_event.event_type = event_type
        stripe_event.api_version = payload.get("api_version")
        stripe_event.payload = payload
        stripe_event.processing_error = None
        stripe_event.processed_at = None
        stripe_event.save(update_fields=["event_type", "api_version", "payload", "processing_error", "processed_at"])

        try:
            if event_type in SUPPORTED_STRIPE_EVENT_TYPES:
                event_object = ((payload.get("data") or {}).get("object") or {})
                if not isinstance(event_object, dict):
                    raise StripeWebhookProcessingError("Invalid Stripe event object.")
                _apply_payment_intent_event(event_type=event_type, payment_intent=event_object)

            stripe_event.processed = True
            stripe_event.processed_at = timezone.now()
            stripe_event.processing_error = None
            stripe_event.save(update_fields=["processed", "processed_at", "processing_error"])
            return stripe_event
        except Exception as exc:
            stripe_event.processing_error = str(exc)
            stripe_event.processed = False
            stripe_event.processed_at = None
            stripe_event.save(update_fields=["processing_error", "processed", "processed_at"])
            raise