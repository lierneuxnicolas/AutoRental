from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import Role
from accounts.services import validate_client_for_reservation
from invoicing.services import InvoiceCreationNotAvailable, create_invoice_for_reservation
from notifications.services import create_notification
from payments.models import Payment, StripeEvent
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import is_vehicle_available


SUPPORTED_STRIPE_EVENT_TYPES = {
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
}

SENSITIVE_PAYLOAD_KEYS = {
    "card_number",
    "cvc",
    "expiry",
    "pin",
    "secret_key",
}


class StripeWebhookProcessingError(ValueError):
    pass


class InvoiceIntegrationPending(StripeWebhookProcessingError):
    pass


def _clean_failure_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None


def _amount_to_minor_units(amount: Decimal) -> int:
    return int((amount * Decimal("100")).quantize(Decimal("1")))


def _parse_stripe_amount(amount: Any) -> int:
    if isinstance(amount, bool) or amount is None:
        raise StripeWebhookProcessingError("Invalid Stripe amount.")

    try:
        return int(amount)
    except (TypeError, ValueError) as exc:
        raise StripeWebhookProcessingError("Invalid Stripe amount.") from exc


def _parse_stripe_currency(currency: Any) -> str:
    if currency is None:
        raise StripeWebhookProcessingError("Missing Stripe currency.")

    cleaned = str(currency).strip().upper()
    if len(cleaned) != 3:
        raise StripeWebhookProcessingError("Invalid Stripe currency.")
    return cleaned


def _notify_once(*, user, notification_type: str, title: str, message: str, related_object_type: str, related_object_id: int):
    existing = user.notifications.filter(
        notification_type=notification_type,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    ).exists()
    if existing:
        return None

    return create_notification(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def _notify_managers_once(*, notification_type: str, title: str, message: str, related_object_type: str, related_object_id: int) -> None:
    manager_roles = [Role.Code.GESTIONNAIRE_COMPTABLE, Role.Code.ADMINISTRATEUR]
    users = get_user_model().objects.filter(
        role__code__in=manager_roles,
        is_active=True,
        role__is_active=True,
    ).select_related("role")

    for user in users:
        _notify_once(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
        )


def _notify_once_on_commit(*, user, notification_type: str, title: str, message: str, related_object_type: str, related_object_id: int) -> None:
    _notify_once(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def _notify_managers_once_on_commit(*, notification_type: str, title: str, message: str, related_object_type: str, related_object_id: int) -> None:
    _notify_managers_once(
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def _event_to_payload(event: Any) -> dict[str, Any]:
    if hasattr(event, "to_dict_recursive"):
        payload = event.to_dict_recursive()
        return _sanitize_payload(payload)
    if isinstance(event, dict):
        return _sanitize_payload(event)
    return _sanitize_payload(dict(event))


def _sanitize_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        sanitized: dict[str, Any] = {}
        for key, value in payload.items():
            key_text = str(key).strip().lower()
            if key_text in SENSITIVE_PAYLOAD_KEYS:
                continue
            sanitized[key] = _sanitize_payload(value)
        return sanitized

    if isinstance(payload, list):
        return [_sanitize_payload(item) for item in payload]

    return payload


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


def _validate_amount_and_currency(*, payment: Payment, payment_intent: dict[str, Any]) -> None:
    stripe_amount = _parse_stripe_amount(payment_intent.get("amount_received", payment_intent.get("amount")))
    local_amount = _amount_to_minor_units(payment.amount)
    if stripe_amount != local_amount:
        raise StripeWebhookProcessingError("Stripe amount mismatch.")

    stripe_currency = _parse_stripe_currency(payment_intent.get("currency"))
    if stripe_currency != payment.currency:
        raise StripeWebhookProcessingError("Stripe currency mismatch.")


def _payment_terminal_state_matches_event(*, payment: Payment, event_type: str) -> bool:
    return (
        (event_type == "payment_intent.succeeded" and payment.status == Payment.Status.REUSSI)
        or (event_type == "payment_intent.payment_failed" and payment.status == Payment.Status.ECHOUE)
        or (event_type == "payment_intent.canceled" and payment.status == Payment.Status.ANNULE)
    )


def _assert_profile_still_valid(reservation: Reservation) -> None:
    eligibility = validate_client_for_reservation(
        client=reservation.client,
        reservation_start_date=reservation.start_at.date(),
        reservation_end_date=reservation.end_at.date(),
    )
    if eligibility.is_eligible:
        return

    raise StripeWebhookProcessingError(
        "Client profile or documents are no longer valid for this reservation."
    )


def _is_vehicle_available_for_reservation(reservation: Reservation) -> bool:
    reservation_queryset = Reservation.objects.exclude(pk=reservation.pk)
    return is_vehicle_available(
        vehicle=reservation.vehicle,
        start=reservation.start_at,
        end=reservation.end_at,
        reservation_queryset=reservation_queryset,
    )


def _handle_success(*, payment: Payment, reservation: Reservation, vehicle: Vehicle, payment_intent: dict[str, Any]) -> None:
    if payment.status == Payment.Status.REUSSI:
        return

    _validate_amount_and_currency(payment=payment, payment_intent=payment_intent)
    _assert_profile_still_valid(reservation)

    if not _is_vehicle_available_for_reservation(reservation):
        payment.status = Payment.Status.ECHOUE
        payment.failed_at = timezone.now()
        payment.succeeded_at = None
        payment.cancelled_at = None
        payment.failure_code = "AVAILABILITY_CONFLICT"
        payment.failure_message = "Vehicule indisponible apres paiement. Remboursement a preparer."
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

        reservation.status = Reservation.Status.PAIEMENT_ECHOUE
        reservation.save(update_fields=["status", "updated_at"])

        _notify_managers_once_on_commit(
            notification_type="PAYMENT_CONFLICT",
            title="Conflit apres paiement Stripe",
            message=(
                f"La reservation {reservation.reference} a ete payee mais le vehicule n'est plus disponible. "
                "Remboursement a preparer manuellement."
            ),
            related_object_type="Reservation",
            related_object_id=reservation.id,
        )
        return

    now = timezone.now()
    payment.status = Payment.Status.REUSSI
    payment.succeeded_at = now
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

    reservation.status = Reservation.Status.CONFIRMEE
    if reservation.confirmed_at is None:
        reservation.confirmed_at = now
        reservation.save(update_fields=["status", "confirmed_at", "updated_at"])
    else:
        reservation.save(update_fields=["status", "updated_at"])

    if vehicle.status != Vehicle.Status.RESERVE:
        vehicle.status = Vehicle.Status.RESERVE
        vehicle.save(update_fields=["status", "updated_at"])

    notification_message = f"Le paiement de votre reservation {reservation.reference} a ete valide."
    _notify_once_on_commit(
        user=reservation.client.user,
        notification_type="PAYMENT_SUCCEEDED",
        title="Paiement reussi",
        message=notification_message,
        related_object_type="payment",
        related_object_id=payment.id,
    )
    _notify_once_on_commit(
        user=reservation.client.user,
        notification_type="RESERVATION_CONFIRMED",
        title="Reservation confirmee",
        message=f"Votre reservation {reservation.reference} est confirmee.",
        related_object_type="reservation",
        related_object_id=reservation.id,
    )

    try:
        invoice = create_invoice_for_reservation(reservation)
    except InvoiceCreationNotAvailable as exc:
        raise InvoiceIntegrationPending(str(exc)) from exc
    else:
        if invoice is not None:
            invoice_id = getattr(invoice, "id", None)
            if invoice_id is not None:
                _notify_once_on_commit(
                    user=reservation.client.user,
                    notification_type="INVOICE_AVAILABLE",
                    title="Facture disponible",
                    message=f"La facture de votre reservation {reservation.reference} est disponible.",
                    related_object_type="invoice",
                    related_object_id=invoice_id,
                )


def _handle_failed(*, payment: Payment, reservation: Reservation, payment_intent: dict[str, Any]) -> None:
    if payment.status == Payment.Status.ECHOUE:
        return

    last_payment_error = payment_intent.get("last_payment_error") or {}
    payment.status = Payment.Status.ECHOUE
    payment.failed_at = timezone.now()
    payment.succeeded_at = None
    payment.cancelled_at = None
    payment.failure_code = _clean_failure_text(last_payment_error.get("code"))
    payment.failure_message = _clean_failure_text(last_payment_error.get("message"))
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

    reservation.status = Reservation.Status.PAIEMENT_ECHOUE
    reservation.save(update_fields=["status", "updated_at"])

    _notify_once_on_commit(
        user=reservation.client.user,
        notification_type="PAYMENT_FAILED",
        title="Paiement echoue",
        message="Votre paiement n'a pas abouti. Veuillez reessayer.",
        related_object_type="payment",
        related_object_id=payment.id,
    )


def _handle_canceled(*, payment: Payment, reservation: Reservation) -> None:
    if payment.status == Payment.Status.ANNULE:
        return

    payment.status = Payment.Status.ANNULE
    payment.cancelled_at = timezone.now()
    payment.succeeded_at = None
    payment.failed_at = None
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

    reservation.status = Reservation.Status.PAIEMENT_ECHOUE
    reservation.save(update_fields=["status", "updated_at"])

    _notify_once_on_commit(
        user=reservation.client.user,
        notification_type="PAYMENT_CANCELED",
        title="Paiement annule",
        message=f"Le paiement Stripe de votre reservation {reservation.reference} a ete annule.",
        related_object_type="Reservation",
        related_object_id=reservation.id,
    )


def _apply_payment_intent_event(*, event_type: str, payment_intent: dict[str, Any]) -> None:
    stripe_payment_intent_id = payment_intent.get("id")
    if not stripe_payment_intent_id:
        raise StripeWebhookProcessingError("Missing payment intent id.")

    payment = (
        Payment.objects.select_for_update()
        .select_related("reservation", "reservation__client", "reservation__client__user", "reservation__vehicle", "reservation__vehicle__brand", "reservation__vehicle__category")
        .filter(stripe_payment_intent_id=stripe_payment_intent_id)
        .first()
    )
    if payment is None:
        raise StripeWebhookProcessingError("Unknown payment intent.")

    reservation = Reservation.objects.select_for_update().select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category").get(pk=payment.reservation_id)
    vehicle = Vehicle.objects.select_for_update().select_related("brand", "category").get(pk=reservation.vehicle_id)

    metadata = _get_object_metadata(payment_intent)
    _validate_payment_metadata(payment=payment, metadata=metadata)

    if _payment_terminal_state_matches_event(payment=payment, event_type=event_type):
        return

    if event_type == "payment_intent.succeeded":
        _handle_success(payment=payment, reservation=reservation, vehicle=vehicle, payment_intent=payment_intent)
        return

    if event_type == "payment_intent.payment_failed":
        _handle_failed(payment=payment, reservation=reservation, payment_intent=payment_intent)
        return

    if event_type == "payment_intent.canceled":
        payment.failure_code = _clean_failure_text(payment_intent.get("cancellation_reason"))
        _handle_canceled(payment=payment, reservation=reservation)


def process_stripe_event(event: Any) -> StripeEvent:
    payload = _event_to_payload(event)
    stripe_event_id = payload.get("id")
    event_type = payload.get("type")

    if not stripe_event_id or not event_type:
        raise StripeWebhookProcessingError("Invalid Stripe event payload.")

    StripeEvent.objects.get_or_create(
        stripe_event_id=stripe_event_id,
        defaults={
            "event_type": event_type,
            "api_version": payload.get("api_version"),
            "payload": payload,
        },
    )

    try:
        with transaction.atomic():
            stripe_event = StripeEvent.objects.select_for_update().get(stripe_event_id=stripe_event_id)

            if stripe_event.processed:
                return stripe_event

            stripe_event.event_type = event_type
            stripe_event.api_version = payload.get("api_version")
            stripe_event.payload = payload
            stripe_event.processing_error = None
            stripe_event.processed_at = None
            stripe_event.save(update_fields=["event_type", "api_version", "payload", "processing_error", "processed_at"])

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
        with transaction.atomic():
            stripe_event = StripeEvent.objects.select_for_update().get(stripe_event_id=stripe_event_id)
            stripe_event.processing_error = str(exc)
            stripe_event.processed = False
            stripe_event.processed_at = None
            stripe_event.save(update_fields=["processing_error", "processed", "processed_at"])
        raise