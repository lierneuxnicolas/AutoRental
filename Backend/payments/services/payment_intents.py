from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import stripe
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from accounts.services import validate_client_for_reservation
from payments.models import Deposit, Payment
from reservations.models import Reservation
from reservations.services.pricing import PricingError, calculate_price_simulation
from vehicles.models import Vehicle
from vehicles.services import is_vehicle_available


@dataclass(frozen=True)
class PaymentIntentError(ValueError):
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_payment_intent_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise PaymentIntentError(code=code, message=message, details=details)


def _amount_to_minor_units(amount: Decimal) -> int:
    return int((amount * Decimal("100")).quantize(Decimal("1")))


def _status_from_stripe(stripe_status: str) -> str:
    status_map = {
        "requires_payment_method": Payment.Status.EN_ATTENTE,
        "requires_confirmation": Payment.Status.EN_ATTENTE,
        "requires_action": Payment.Status.ACTION_REQUISE,
        "processing": Payment.Status.TRAITEMENT,
        "requires_capture": Payment.Status.TRAITEMENT,
        "succeeded": Payment.Status.REUSSI,
        "canceled": Payment.Status.ANNULE,
    }
    return status_map.get(stripe_status, Payment.Status.EN_ATTENTE)


def _is_reusable_stripe_status(stripe_status: str) -> bool:
    return stripe_status in {
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "processing",
        "requires_capture",
    }


def _assert_owner_and_role(*, reservation: Reservation, requested_by) -> None:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_payment_intent_error("AUTH_REQUIRED", "Authentification requise.")

    role = getattr(requested_by, "role", None)
    role_code = getattr(role, "code", None)
    if role_code != Role.Code.CLIENT:
        _raise_payment_intent_error("INVALID_ROLE", "Le role CLIENT est requis.")

    owner = getattr(getattr(reservation, "client", None), "user", None)
    if owner is None or owner != requested_by:
        _raise_payment_intent_error("FORBIDDEN", "Vous ne pouvez payer que vos propres reservations.")


def _assert_profile_still_valid(reservation: Reservation) -> None:
    eligibility = validate_client_for_reservation(
        client=reservation.client,
        reservation_start_date=reservation.start_at.date(),
        reservation_end_date=reservation.end_at.date(),
    )
    if eligibility.is_eligible:
        return

    _raise_payment_intent_error(
        "PROFILE_NOT_ELIGIBLE",
        "Le profil client n'est plus valide pour cette reservation.",
        details={"eligibility_errors": list(eligibility.errors)},
    )


def _assert_vehicle_still_available(reservation: Reservation) -> None:
    if not is_vehicle_available(
        vehicle=reservation.vehicle,
        start=reservation.start_at,
        end=reservation.end_at,
    ):
        _raise_payment_intent_error(
            "RESERVATION_UNAVAILABLE",
            "Le vehicule n'est plus disponible pour cette reservation.",
        )


def _assert_deposit_authorized(reservation: Reservation) -> None:
    now = timezone.now()
    deposit = (
        Deposit.objects.select_for_update()
        .filter(reservation=reservation, status=Deposit.Status.AUTORISEE)
        .order_by("-authorized_at", "-created_at")
        .first()
    )

    if deposit is None:
        _raise_payment_intent_error(
            "DEPOSIT_NOT_AUTHORIZED",
            "Une caution AUTORISEE est requise avant le paiement.",
        )

    if deposit.authorization_expires_at is not None and deposit.authorization_expires_at <= now:
        _raise_payment_intent_error(
            "DEPOSIT_AUTHORIZATION_EXPIRED",
            "La preautorisation de caution a expire.",
        )


def _recalculate_rental_amount(reservation: Reservation) -> Decimal:
    try:
        pricing = calculate_price_simulation(
            vehicle=reservation.vehicle,
            start_at=reservation.start_at,
            end_at=reservation.end_at,
        )
    except PricingError as exc:
        _raise_payment_intent_error(
            "PRICING_ERROR",
            "Impossible de recalculer le montant de location.",
            details={"pricing_error": exc.code},
        )

    if pricing.rental_amount < 0:
        _raise_payment_intent_error("INCONSISTENT_AMOUNT", "Le montant recalcule est incoherent.")

    return pricing.rental_amount


def _build_idempotency_key(*, reservation_id: int, amount: Decimal) -> str:
    amount_version = _amount_to_minor_units(amount)
    return f"reservation-payment-{reservation_id}-{amount_version}"


def _find_reusable_payment(*, reservation: Reservation, amount: Decimal) -> Payment | None:
    return (
        Payment.objects.select_for_update()
        .filter(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=amount,
            currency="EUR",
            status__in=[
                Payment.Status.EN_ATTENTE,
                Payment.Status.ACTION_REQUISE,
                Payment.Status.TRAITEMENT,
            ],
            stripe_payment_intent_id__isnull=False,
        )
        .order_by("-created_at")
        .first()
    )


def _configure_stripe() -> None:
    stripe_secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_secret_key:
        _raise_payment_intent_error(
            "STRIPE_NOT_CONFIGURED",
            "STRIPE_SECRET_KEY est requis pour creer un PaymentIntent.",
        )
    stripe.api_key = stripe_secret_key


def _create_payment_intent(*, reservation: Reservation, payment: Payment, amount: Decimal):
    metadata = {
        "reservation_id": str(reservation.id),
        "reservation_reference": reservation.reference,
        "payment_id": str(payment.id),
        "purpose": "rental_payment",
    }

    try:
        return stripe.PaymentIntent.create(
            amount=_amount_to_minor_units(amount),
            currency="eur",
            metadata=metadata,
            idempotency_key=_build_idempotency_key(reservation_id=reservation.id, amount=amount),
        )
    except stripe.error.APIConnectionError:
        _raise_payment_intent_error(
            "STRIPE_UNAVAILABLE",
            "Stripe est temporairement indisponible.",
        )
    except stripe.error.StripeError as exc:
        _raise_payment_intent_error(
            "STRIPE_ERROR",
            "Erreur Stripe lors de la creation du PaymentIntent.",
            details={"stripe_error": str(exc)},
        )


def create_or_reuse_payment_intent(
    *,
    reservation,
    requested_by,
):
    _configure_stripe()

    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )
        Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)

        _assert_owner_and_role(reservation=reservation_locked, requested_by=requested_by)
        _assert_profile_still_valid(reservation_locked)
        _assert_vehicle_still_available(reservation_locked)
        _assert_deposit_authorized(reservation_locked)

        rental_amount = _recalculate_rental_amount(reservation_locked)
        if reservation_locked.rental_amount != rental_amount:
            reservation_locked.rental_amount = rental_amount
            reservation_locked.save(update_fields=["rental_amount", "updated_at"])

        reusable_payment = _find_reusable_payment(reservation=reservation_locked, amount=rental_amount)
        if reusable_payment is not None:
            try:
                existing_pi = stripe.PaymentIntent.retrieve(reusable_payment.stripe_payment_intent_id)
            except stripe.error.APIConnectionError:
                _raise_payment_intent_error("STRIPE_UNAVAILABLE", "Stripe est temporairement indisponible.")
            except stripe.error.StripeError as exc:
                _raise_payment_intent_error(
                    "STRIPE_ERROR",
                    "Impossible de verifier le PaymentIntent existant.",
                    details={"stripe_error": str(exc)},
                )

            if _is_reusable_stripe_status(existing_pi.status):
                reusable_payment.status = _status_from_stripe(existing_pi.status)
                reusable_payment.amount = rental_amount
                reusable_payment.currency = "EUR"
                reusable_payment.save(update_fields=["status", "amount", "currency", "updated_at"])

                reservation_locked.status = Reservation.Status.EN_ATTENTE_PAIEMENT
                reservation_locked.save(update_fields=["status", "updated_at"])

                return {
                    "client_secret": getattr(existing_pi, "client_secret", None),
                    "payment_id": reusable_payment.id,
                }

        payment = Payment.objects.create(
            reservation=reservation_locked,
            provider=Payment.Provider.STRIPE,
            amount=rental_amount,
            currency="EUR",
            status=Payment.Status.CREE,
        )

        payment_intent = _create_payment_intent(
            reservation=reservation_locked,
            payment=payment,
            amount=rental_amount,
        )

        payment.status = _status_from_stripe(payment_intent.status)
        payment.amount = rental_amount
        payment.currency = "EUR"
        payment.stripe_payment_intent_id = payment_intent.id
        payment.failed_at = None
        payment.failure_code = None
        payment.failure_message = None
        payment.save(
            update_fields=[
                "status",
                "amount",
                "currency",
                "stripe_payment_intent_id",
                "failed_at",
                "failure_code",
                "failure_message",
                "updated_at",
            ]
        )

        reservation_locked.status = Reservation.Status.EN_ATTENTE_PAIEMENT
        reservation_locked.save(update_fields=["status", "updated_at"])

        return {
            "client_secret": getattr(payment_intent, "client_secret", None),
            "payment_id": payment.id,
        }