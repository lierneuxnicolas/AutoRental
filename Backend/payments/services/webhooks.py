from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

import stripe
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import Role
from accounts.services import check_vehicle_compatibility_for_client, validate_client_for_reservation
from notifications.services import create_notification
from common.models import SystemLog
from common.services import create_system_log
from interventions.services.vehicle_access import activate_vehicle_access
from payments.models import Deposit, Payment, Refund, StripeEvent
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import AvailabilityValidationError, is_vehicle_available


SUPPORTED_STRIPE_EVENT_TYPES = {
    "payment_intent.amount_capturable_updated",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "refund.created",
    "refund.updated",
    "refund.failed",
}
logger = logging.getLogger(__name__)

CONFLICT_REFUND_REASON = "Vehicule indisponible apres paiement"

SENSITIVE_PAYLOAD_KEYS = {
    "card_number",
    "cvc",
    "expiry",
    "pin",
    "secret_key",
}


class StripeWebhookProcessingError(ValueError):
    pass


def _safe_log_payment_result(*, action: str, level: str | SystemLog.Level, payment: Payment, reservation: Reservation, user, suffix: str = "") -> None:
    try:
        message = (
            f"Payment id={payment.id}, reservation={reservation.reference} (id={reservation.id}), "
            f"amount={payment.amount} {payment.currency}."
        )
        if suffix:
            message = f"{message} {suffix}"

        create_system_log(
            user=user,
            action=action,
            message=message,
            level=level,
        )
    except Exception:
        # Logging failures must not impact Stripe webhook business processing.
        return


def _safe_log_deposit_result(*, action: str, level: str | SystemLog.Level, deposit: Deposit, reservation: Reservation, user, suffix: str = "") -> None:
    try:
        message = (
            f"Deposit id={deposit.id}, reservation={reservation.reference} (id={reservation.id}), "
            f"amount={deposit.amount} {deposit.currency}."
        )
        if suffix:
            message = f"{message} {suffix}"

        create_system_log(
            user=user,
            action=action,
            message=message,
            level=level,
        )
    except Exception:
        return


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


def _format_local_datetime(value) -> str:
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def _send_reservation_confirmation_email(*, reservation: Reservation) -> None:
    client_user = reservation.client.user
    first_name = (getattr(client_user, "first_name", "") or "").strip()
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"
    vehicle_brand = getattr(getattr(reservation.vehicle, "brand", None), "name", "").strip()
    vehicle_model = (getattr(reservation.vehicle, "model_name", "") or "").strip()
    vehicle_label = " ".join(part for part in [vehicle_brand, vehicle_model] if part)

    send_mail(
        subject="Votre réservation GetACar est confirmée",
        message=(
            f"{greeting}\n\n"
            "Votre réservation GetACar est confirmée.\n\n"
            f"Référence : {reservation.reference}\n"
            f"Véhicule : {vehicle_label}\n"
            f"Début : {_format_local_datetime(reservation.start_at)}\n"
            f"Fin : {_format_local_datetime(reservation.end_at)}\n"
            f"Montant de location : {reservation.rental_amount}\n"
            f"Caution : {reservation.deposit_amount}\n\n"
            "Vous pouvez consulter votre réservation depuis votre espace client.\n\n"
            "Merci,\n"
            "GetACar"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[client_user.email],
        fail_silently=False,
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
    if hasattr(event, "items"):
        try:
            return _sanitize_payload(dict(event.items()))
        except Exception:
            pass
    if hasattr(event, "to_dict"):
        payload = event.to_dict()
        if isinstance(payload, dict):
            return _sanitize_payload(payload)
    raise StripeWebhookProcessingError("Invalid Stripe event payload.")


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


def _get_payment_intent_purpose(payment_intent: dict[str, Any]) -> str:
    metadata = _get_object_metadata(payment_intent)
    purpose = metadata.get("purpose")
    return str(purpose).strip().lower() if purpose is not None else ""


def _get_deposit_identifier(metadata: dict[str, Any]) -> int | None:
    deposit_id = metadata.get("deposit_id")
    try:
        parsed = int(deposit_id)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


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


def _deposit_terminal_state_matches_event(*, deposit: Deposit, event_type: str) -> bool:
    return (
        (event_type == "payment_intent.amount_capturable_updated" and deposit.status == Deposit.Status.AUTORISEE)
    )


def _validate_deposit_metadata(*, deposit: Deposit, metadata: dict[str, Any]) -> None:
    deposit_id = metadata.get("deposit_id")
    if deposit_id not in (None, "", str(deposit.id)):
        raise StripeWebhookProcessingError("deposit_id metadata mismatch.")


def _validate_deposit_amount_and_currency(*, deposit: Deposit, payment_intent: dict[str, Any]) -> None:
    stripe_amount = _parse_stripe_amount(
        payment_intent.get("amount_capturable", payment_intent.get("amount_received", payment_intent.get("amount")))
    )
    local_amount = _amount_to_minor_units(deposit.amount)
    if stripe_amount != local_amount:
        raise StripeWebhookProcessingError("Stripe amount mismatch.")

    stripe_currency = _parse_stripe_currency(payment_intent.get("currency"))
    if stripe_currency != deposit.currency:
        raise StripeWebhookProcessingError("Stripe currency mismatch.")


def _handle_deposit_authorized(*, deposit: Deposit, reservation: Reservation, payment_intent: dict[str, Any]) -> None:
    if deposit.status in {Deposit.Status.AUTORISEE, Deposit.Status.A_VERIFIER, Deposit.Status.CAPTUREE, Deposit.Status.LIBEREE}:
        return

    _validate_deposit_amount_and_currency(deposit=deposit, payment_intent=payment_intent)

    now = timezone.now()
    deposit.status = Deposit.Status.AUTORISEE
    if deposit.authorized_at is None:
        deposit.authorized_at = now
    deposit.failed_at = None
    deposit.captured_at = None
    deposit.released_at = None
    deposit.authorization_expires_at = None
    deposit_id = payment_intent.get("id")
    if deposit_id and not deposit.stripe_payment_intent_id:
        deposit.stripe_payment_intent_id = str(deposit_id)
    deposit.save(
        update_fields=[
            "status",
            "authorized_at",
            "failed_at",
            "captured_at",
            "released_at",
            "authorization_expires_at",
            "stripe_payment_intent_id",
            "updated_at",
        ]
    )

    if reservation.status == Reservation.Status.BROUILLON:
        reservation.status = Reservation.Status.EN_ATTENTE_PAIEMENT
        reservation.save(update_fields=["status", "updated_at"])

    _safe_log_deposit_result(
        action="DEPOSIT_AUTHORIZED",
        level=SystemLog.Level.INFO,
        deposit=deposit,
        reservation=reservation,
        user=reservation.client.user,
    )


def _is_profile_still_valid(reservation: Reservation) -> bool:
    try:
        eligibility = validate_client_for_reservation(
            client=reservation.client,
            reservation_start_date=timezone.localtime(reservation.start_at).date(),
            reservation_end_date=timezone.localtime(reservation.end_at).date(),
        )
    except ValidationError:
        logger.warning("Invalid profile data for reservation %s after payment", reservation.pk)
        return False
    return eligibility.is_eligible


def _is_vehicle_available_for_reservation(reservation: Reservation) -> bool:
    reservation_queryset = Reservation.objects.exclude(pk=reservation.pk)
    try:
        return is_vehicle_available(
            vehicle=reservation.vehicle,
            start=reservation.start_at,
            end=reservation.end_at,
            reservation_queryset=reservation_queryset,
        )
    except AvailabilityValidationError:
        return False


def _prepare_conflict_refund(*, payment: Payment, reservation: Reservation, reason=CONFLICT_REFUND_REASON):
    """Record a refund for a payment received after the vehicle was taken; Stripe is called after commit."""
    refund = Refund.objects.filter(payment=payment, reason=reason).first()
    if refund is None:
        refund = Refund.objects.create(
            payment=payment,
            reservation=reservation,
            amount=payment.amount,
            currency="EUR",
            status=Refund.Status.DEMANDE,
            reason=reason,
        )
    refund_id = refund.id
    payment_intent_id = payment.stripe_payment_intent_id

    def _run_refund() -> None:
        refund_obj = Refund.objects.get(pk=refund_id)
        if refund_obj.status in {Refund.Status.EN_COURS, Refund.Status.REUSSI} or not payment_intent_id:
            return
        try:
            stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
            stripe_refund = stripe.Refund.create(
                payment_intent=payment_intent_id,
                amount=_amount_to_minor_units(refund_obj.amount),
                metadata={"refund_id": str(refund_id), "purpose": "availability_conflict"},
                idempotency_key=f"availability-conflict-refund:{refund_id}",
            )
        except stripe.error.StripeError:
            logger.exception("Stripe refund failed for refund %s; manual follow-up required", refund_id)
            return
        refund_obj.stripe_refund_id = getattr(stripe_refund, "id", None)
        stripe_status = getattr(stripe_refund, "status", None)
        refund_obj.status = Refund.Status.REUSSI if stripe_status == "succeeded" else Refund.Status.EN_COURS
        if refund_obj.status == Refund.Status.REUSSI:
            refund_obj.succeeded_at = timezone.now()
        refund_obj.save(update_fields=["stripe_refund_id", "status", "succeeded_at", "updated_at"])

    return _run_refund


def _handle_success(
    *,
    payment: Payment,
    reservation: Reservation,
    vehicle: Vehicle,
    payment_intent: dict[str, Any],
    post_commit_actions: list,
) -> None:
    if payment.status == Payment.Status.REUSSI:
        return

    _validate_amount_and_currency(payment=payment, payment_intent=payment_intent)
    if payment.failure_code in {"AVAILABILITY_CONFLICT", "ELIGIBILITY_CONFLICT"}:
        return
    valid_profile = _is_profile_still_valid(reservation)
    compatible = check_vehicle_compatibility_for_client(client=reservation.client, vehicle=reservation.vehicle).is_compatible
    available = _is_vehicle_available_for_reservation(reservation)
    payable_status = reservation.status in {
        Reservation.Status.BROUILLON,
        Reservation.Status.EN_ATTENTE_CAUTION,
        Reservation.Status.EN_ATTENTE_PAIEMENT,
        Reservation.Status.PAIEMENT_ECHOUE,
    }
    if not valid_profile or not compatible or not available or not payable_status:
        failure_code = "AVAILABILITY_CONFLICT" if not available else "ELIGIBILITY_CONFLICT"
        reason = CONFLICT_REFUND_REASON if not available else "Conditions de reservation non remplies apres paiement"
        payment.status = Payment.Status.ECHOUE
        payment.failed_at = timezone.now()
        payment.succeeded_at = None
        payment.cancelled_at = None
        payment.failure_code = failure_code
        payment.failure_message = f"{reason}. Remboursement a preparer."
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

        if payable_status:
            reservation.status = Reservation.Status.PAIEMENT_ECHOUE
            reservation.save(update_fields=["status", "updated_at"])

        _safe_log_payment_result(
            action="PAYMENT_FAILED",
            level=SystemLog.Level.ERROR,
            payment=payment,
            reservation=reservation,
            user=reservation.client.user,
            suffix=f"reason={failure_code}",
        )

        _notify_managers_once_on_commit(
            notification_type="PAYMENT_CONFLICT",
            title="Conflit apres paiement Stripe",
            message=(
                f"La reservation {reservation.reference} a ete payee mais les conditions ne sont plus remplies. "
                "Remboursement a preparer manuellement."
            ),
            related_object_type="Reservation",
            related_object_id=reservation.id,
        )
        post_commit_actions.append(_prepare_conflict_refund(payment=payment, reservation=reservation, reason=reason))
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

    _safe_log_payment_result(
        action="PAYMENT_SUCCESS",
        level=SystemLog.Level.INFO,
        payment=payment,
        reservation=reservation,
        user=reservation.client.user,
    )

    reservation.status = Reservation.Status.CONFIRMEE
    if reservation.confirmed_at is None:
        reservation.confirmed_at = now
        reservation.save(update_fields=["status", "confirmed_at", "updated_at"])
    else:
        reservation.save(update_fields=["status", "updated_at"])

    activate_vehicle_access(
        reservation=reservation,
        requested_by=reservation.client.user,
    )

    if vehicle.status != Vehicle.Status.RESERVE:
        vehicle.status = Vehicle.Status.RESERVE
        vehicle.save(update_fields=["status", "updated_at"])

    client_user = reservation.client.user
    reservation_reference = reservation.reference
    payment_id = payment.id
    reservation_id = reservation.id

    def _run_success_notifications() -> None:
        notification_message = f"Le paiement de votre reservation {reservation_reference} a ete valide."
        _notify_once(
            user=client_user,
            notification_type="PAYMENT_SUCCEEDED",
            title="Paiement reussi",
            message=notification_message,
            related_object_type="payment",
            related_object_id=payment_id,
        )
        _notify_once(
            user=client_user,
            notification_type="RESERVATION_CONFIRMED",
            title="Reservation confirmee",
            message=f"Votre reservation {reservation_reference} est confirmee.",
            related_object_type="reservation",
            related_object_id=reservation_id,
        )
        _send_reservation_confirmation_email(reservation=reservation)
    post_commit_actions.append(_run_success_notifications)


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

    failure_code = payment.failure_code or "UNKNOWN"
    _safe_log_payment_result(
        action="PAYMENT_FAILED",
        level=SystemLog.Level.ERROR,
        payment=payment,
        reservation=reservation,
        user=reservation.client.user,
        suffix=f"reason={failure_code}",
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


def _apply_payment_intent_event(*, event_type: str, payment_intent: dict[str, Any], post_commit_actions: list) -> None:
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
        return

    try:
        reservation = Reservation.objects.select_for_update().select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category").get(pk=payment.reservation_id)
    except Reservation.DoesNotExist:
        return
    vehicle = Vehicle.objects.select_for_update().select_related("brand", "category").get(pk=reservation.vehicle_id)

    metadata = _get_object_metadata(payment_intent)
    _validate_payment_metadata(payment=payment, metadata=metadata)

    if _payment_terminal_state_matches_event(payment=payment, event_type=event_type):
        return

    if event_type == "payment_intent.succeeded":
        _handle_success(
            payment=payment,
            reservation=reservation,
            vehicle=vehicle,
            payment_intent=payment_intent,
            post_commit_actions=post_commit_actions,
        )
        return

    if event_type == "payment_intent.payment_failed":
        _handle_failed(payment=payment, reservation=reservation, payment_intent=payment_intent)
        return

    if event_type == "payment_intent.canceled":
        payment.failure_code = _clean_failure_text(payment_intent.get("cancellation_reason"))
        _handle_canceled(payment=payment, reservation=reservation)


def _apply_deposit_event(*, event_type: str, payment_intent: dict[str, Any]) -> None:
    if event_type != "payment_intent.amount_capturable_updated":
        return

    metadata = _get_object_metadata(payment_intent)
    deposit_id = _get_deposit_identifier(metadata)
    stripe_payment_intent_id = payment_intent.get("id")

    deposit_queryset = Deposit.objects.select_for_update().select_related("reservation", "reservation__client", "reservation__client__user")
    deposit = None
    if deposit_id is not None:
        deposit = deposit_queryset.filter(pk=deposit_id).first()
    if deposit is None and stripe_payment_intent_id:
        deposit = deposit_queryset.filter(stripe_payment_intent_id=stripe_payment_intent_id).first()
    if deposit is None:
        return

    reservation = Reservation.objects.select_for_update().select_related("client", "client__user", "vehicle").get(pk=deposit.reservation_id)

    _validate_deposit_metadata(deposit=deposit, metadata=metadata)

    if _deposit_terminal_state_matches_event(deposit=deposit, event_type=event_type):
        return

    _handle_deposit_authorized(deposit=deposit, reservation=reservation, payment_intent=payment_intent)


def _apply_refund_event(*, event_object: dict[str, Any]) -> None:
    refund_id = event_object.get("id")
    if not isinstance(refund_id, str) or not refund_id:
        raise StripeWebhookProcessingError("Missing Stripe refund id.")

    metadata = event_object.get("metadata") or {}
    if not isinstance(metadata, dict):
        raise StripeWebhookProcessingError("Invalid Stripe refund metadata.")

    refund = Refund.objects.filter(stripe_refund_id=refund_id).first()
    if refund is None and metadata.get("purpose") == "reservation_cancellation":
        local_id = metadata.get("refund_id")
        if not str(local_id or "").isdigit():
            raise StripeWebhookProcessingError("Missing local cancellation refund id.")
        refund = Refund.objects.filter(pk=int(local_id)).first()
        if refund is None:
            raise StripeWebhookProcessingError("Cancellation refund is not available yet.")
    if refund is None:
        return

    if refund.reservation_id is not None:
        Reservation.objects.select_for_update().get(pk=refund.reservation_id)
    refund = Refund.objects.select_for_update().select_related("payment").get(pk=refund.pk)
    if refund.stripe_refund_id and refund.stripe_refund_id != refund_id:
        raise StripeWebhookProcessingError("Stripe refund id mismatch.")

    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not secret_key:
        raise StripeWebhookProcessingError("Stripe is not configured for refund reconciliation.")
    current = stripe.Refund.retrieve(refund_id, api_key=secret_key)
    if (
        current.get("id") != refund_id
        or current.get("payment_intent") != refund.payment.stripe_payment_intent_id
        or _parse_stripe_amount(current.get("amount")) != _amount_to_minor_units(refund.amount)
        or _parse_stripe_currency(current.get("currency")) != refund.currency
    ):
        raise StripeWebhookProcessingError("Stripe refund does not match the recorded payment.")

    statuses = {
        "pending": Refund.Status.EN_COURS,
        "requires_action": Refund.Status.EN_COURS,
        "succeeded": Refund.Status.REUSSI,
        "failed": Refund.Status.ECHOUE,
        "canceled": Refund.Status.ANNULE,
    }
    new_status = statuses.get(current.get("status"))
    if new_status is None:
        raise StripeWebhookProcessingError("Unknown Stripe refund status.")
    refund.stripe_refund_id = refund_id
    refund.status = new_status
    refund.succeeded_at = timezone.now() if new_status == Refund.Status.REUSSI and refund.succeeded_at is None else refund.succeeded_at
    refund.failed_at = timezone.now() if new_status == Refund.Status.ECHOUE and refund.failed_at is None else refund.failed_at
    refund.save(update_fields=["stripe_refund_id", "status", "succeeded_at", "failed_at", "updated_at"])
    if new_status == Refund.Status.REUSSI and refund.reservation_id is not None and refund.reason == "Annulation de reservation":
        from reservations.services.cancellation import finalize_confirmed_cancellation

        finalize_confirmed_cancellation(reservation=Reservation.objects.get(pk=refund.reservation_id))
    if new_status in {Refund.Status.ECHOUE, Refund.Status.ANNULE}:
        _notify_managers_once_on_commit(
            notification_type="REFUND_FAILED",
            title="Remboursement à vérifier",
            message=f"Le remboursement Stripe {refund_id} a échoué ou a été annulé.",
            related_object_type="refund",
            related_object_id=refund.id,
        )


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

    post_commit_actions: list = []
    committed = False
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
                if event_type.startswith("refund."):
                    _apply_refund_event(event_object=event_object)
                elif _get_payment_intent_purpose(event_object) == "deposit":
                    _apply_deposit_event(
                        event_type=event_type,
                        payment_intent=event_object,
                    )
                else:
                    _apply_payment_intent_event(
                        event_type=event_type,
                        payment_intent=event_object,
                        post_commit_actions=post_commit_actions,
                    )

            stripe_event.processed = True
            stripe_event.processed_at = timezone.now()
            stripe_event.processing_error = None
            stripe_event.save(update_fields=["processed", "processed_at", "processing_error"])
        committed = True
        for action in post_commit_actions:
            action()
        return stripe_event
    except Exception as exc:
        if committed:
            raise

        with transaction.atomic():
            stripe_event = StripeEvent.objects.select_for_update().get(stripe_event_id=stripe_event_id)
            stripe_event.processing_error = str(exc)
            stripe_event.processed = False
            stripe_event.processed_at = None
            stripe_event.save(update_fields=["processing_error", "processed", "processed_at"])
        raise


_SYNC_EVENT_TYPE_BY_STRIPE_STATUS = {
    "succeeded": "payment_intent.succeeded",
    "canceled": "payment_intent.canceled",
}


def sync_reservation_payment_from_stripe(reservation: Reservation) -> Reservation:
    """Reconcile the pending PaymentIntent directly with Stripe (no webhook reachable in local dev)."""
    stripe_secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_secret_key:
        return reservation

    payment = (
        Payment.objects.filter(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            status__in=[Payment.Status.EN_ATTENTE, Payment.Status.ACTION_REQUISE, Payment.Status.TRAITEMENT],
        )
        .exclude(stripe_payment_intent_id__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if payment is None:
        return reservation

    stripe.api_key = stripe_secret_key
    try:
        payment_intent = stripe.PaymentIntent.retrieve(payment.stripe_payment_intent_id)
    except Exception:
        return reservation

    event_type = _SYNC_EVENT_TYPE_BY_STRIPE_STATUS.get(payment_intent.status)
    if event_type is None:
        return reservation

    payment_intent_payload = _sanitize_payload(payment_intent.to_dict())

    post_commit_actions: list = []
    with transaction.atomic():
        Payment.objects.select_for_update().get(pk=payment.pk)
        _apply_payment_intent_event(
            event_type=event_type,
            payment_intent=payment_intent_payload,
            post_commit_actions=post_commit_actions,
        )
    for action in post_commit_actions:
        action()

    reservation.refresh_from_db()
    return reservation