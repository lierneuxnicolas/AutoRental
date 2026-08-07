from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any

import stripe
from django.db.models import Q
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import ClientProfile
from accounts.services import validate_client_for_reservation
from notifications.services import create_notification
from payments.models import Deposit
from reservations.models import Reservation
from reservations.services.pricing import PricingError, calculate_price_simulation
from vehicles.services import is_vehicle_available


@dataclass(frozen=True)
class DepositAuthorizationError(ValueError):
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_deposit_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise DepositAuthorizationError(code=code, message=message, details=details)


def _normalize_mode(mode: str) -> str:
    if mode not in {Deposit.Mode.SIMULATED, Deposit.Mode.STRIPE_TEST}:
        _raise_deposit_error(
            "INVALID_MODE",
            "Le mode de caution doit etre SIMULATED ou STRIPE_TEST.",
        )
    return mode


def _validate_reservation_status(reservation: Reservation) -> None:
    allowed_statuses = {
        Reservation.Status.BROUILLON,
        Reservation.Status.EN_ATTENTE_CAUTION,
        Reservation.Status.EN_ATTENTE_PAIEMENT,
    }
    if reservation.status not in allowed_statuses:
        _raise_deposit_error(
            "RESERVATION_STATUS_NOT_COMPATIBLE",
            "Le statut de la reservation ne permet pas une preautorisation de caution.",
            details={"current_status": reservation.status},
        )


def _validate_request_context(*, reservation: Reservation, requested_by) -> ClientProfile:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_deposit_error("AUTH_REQUIRED", "Authentification requise.")

    client = getattr(reservation, "client", None)
    owner = getattr(client, "user", None) if client is not None else None
    if owner is None or owner != requested_by:
        _raise_deposit_error("FORBIDDEN", "Vous ne pouvez autoriser que la caution de vos reservations.")

    client_profile = client
    if not isinstance(client_profile, ClientProfile):
        _raise_deposit_error("INVALID_CLIENT", "Profil client introuvable sur la reservation.")

    eligibility = validate_client_for_reservation(
        client=client_profile,
        reservation_start_date=reservation.start_at.date(),
        reservation_end_date=reservation.end_at.date(),
    )
    if not eligibility.is_eligible:
        _raise_deposit_error(
            "PROFILE_NOT_ELIGIBLE",
            "Le profil client ou les documents ne sont plus valides pour cette reservation.",
            details={"eligibility_errors": list(eligibility.errors)},
        )

    return client_profile


def _recalculate_deposit_amount(reservation: Reservation) -> Decimal:
    current_amount = reservation.deposit_amount
    if current_amount is not None and current_amount > 0:
        return current_amount

    try:
        pricing = calculate_price_simulation(
            vehicle=reservation.vehicle,
            start_at=reservation.start_at,
            end_at=reservation.end_at,
        )
    except PricingError as exc:
        _raise_deposit_error(
            "PRICING_ERROR",
            "Impossible de recalculer le montant de caution.",
            details={"pricing_error": exc.code},
        )

    return pricing.deposit_amount


def _ensure_vehicle_still_available(reservation: Reservation) -> None:
    reservation_queryset = Reservation.objects.exclude(pk=reservation.pk)
    if not is_vehicle_available(
        vehicle=reservation.vehicle,
        start=reservation.start_at,
        end=reservation.end_at,
        reservation_queryset=reservation_queryset,
    ):
        _raise_deposit_error(
            "VEHICLE_UNAVAILABLE",
            "Le vehicule n'est plus disponible pour cette periode.",
        )


def _get_or_create_deposit(*, reservation: Reservation, mode: str, amount: Decimal) -> Deposit:
    deposit = (
        Deposit.objects.select_for_update()
        .filter(
            reservation=reservation,
            status__in=[
                Deposit.Status.CREE,
                Deposit.Status.EN_ATTENTE,
                Deposit.Status.AUTORISEE,
            ],
        )
        .order_by("-created_at")
        .first()
    )

    if deposit is None:
        deposit = Deposit.objects.create(
            reservation=reservation,
            mode=mode,
            amount=amount,
            currency="EUR",
            status=Deposit.Status.CREE,
        )
    else:
        deposit.mode = mode
        deposit.amount = amount
        deposit.currency = "EUR"
        deposit.save(update_fields=["mode", "amount", "currency", "updated_at"])

    return deposit


def _to_minor_units(amount: Decimal) -> int:
    return int((amount * Decimal("100")).quantize(Decimal("1")))


def _build_idempotency_key(*, deposit: Deposit) -> str:
    return f"deposit_authorize:{deposit.id}:{deposit.amount}:{deposit.currency}"


def _notify_deposit_authorized_once(*, reservation: Reservation, deposit: Deposit, owner) -> None:
    message = f"La caution de votre reservation {reservation.reference} a ete autorisee."
    existing_links = set(
        owner.notifications.filter(notification_type="DEPOSIT_AUTHORIZED")
        .filter(
            Q(related_object_type="deposit", related_object_id=deposit.id)
            | Q(related_object_type="reservation", related_object_id=reservation.id)
        )
        .values_list("related_object_type", "related_object_id")
    )

    if ("deposit", deposit.id) not in existing_links:
        create_notification(
            user=owner,
            notification_type="DEPOSIT_AUTHORIZED",
            title="Caution autorisee",
            message=message,
            related_object_type="deposit",
            related_object_id=deposit.id,
        )

    if ("reservation", reservation.id) not in existing_links:
        create_notification(
            user=owner,
            notification_type="DEPOSIT_AUTHORIZED",
            title="Caution autorisee",
            message=message,
            related_object_type="reservation",
            related_object_id=reservation.id,
        )


def _authorize_simulated(*, reservation: Reservation, deposit: Deposit, owner) -> None:
    now = timezone.now()
    deposit.status = Deposit.Status.AUTORISEE
    deposit.authorized_at = now
    deposit.failed_at = None
    deposit.released_at = None
    deposit.captured_at = None
    deposit.authorization_expires_at = None
    deposit.stripe_payment_intent_id = None
    deposit.save(
        update_fields=[
            "status",
            "authorized_at",
            "failed_at",
            "released_at",
            "captured_at",
            "authorization_expires_at",
            "stripe_payment_intent_id",
            "updated_at",
        ]
    )

    if reservation.status == Reservation.Status.BROUILLON:
        reservation.status = Reservation.Status.EN_ATTENTE_PAIEMENT
        reservation.save(update_fields=["status", "updated_at"])


def _authorize_stripe_test(*, reservation: Reservation, deposit: Deposit) -> str | None:
    stripe_api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_api_key:
        _raise_deposit_error(
            "STRIPE_NOT_CONFIGURED",
            "STRIPE_SECRET_KEY est requis pour le mode STRIPE_TEST.",
        )

    stripe.api_key = stripe_api_key

    metadata = {
        "reservation_id": str(reservation.id),
        "reservation_reference": reservation.reference,
        "deposit_id": str(deposit.id),
        "purpose": "deposit",
    }

    payment_intent = stripe.PaymentIntent.create(
        amount=_to_minor_units(deposit.amount),
        currency="eur",
        capture_method="manual",
        metadata=metadata,
        idempotency_key=_build_idempotency_key(deposit=deposit),
    )

    deposit.status = Deposit.Status.AUTORISEE
    deposit.authorized_at = timezone.now()
    deposit.failed_at = None
    deposit.stripe_payment_intent_id = payment_intent.id
    deposit.authorization_expires_at = None

    charges_data = getattr(payment_intent, "charges", None)
    if charges_data and getattr(charges_data, "data", None):
        first_charge = charges_data.data[0]
        payment_method_details = getattr(first_charge, "payment_method_details", None)
        card_details = getattr(payment_method_details, "card", None) if payment_method_details else None
        if card_details is not None:
            capture_before = getattr(card_details, "capture_before", None)
            if capture_before:
                deposit.authorization_expires_at = datetime.fromtimestamp(capture_before, tz=dt_timezone.utc)

    deposit.save(
        update_fields=[
            "status",
            "authorized_at",
            "failed_at",
            "stripe_payment_intent_id",
            "authorization_expires_at",
            "updated_at",
        ]
    )

    if reservation.status == Reservation.Status.BROUILLON:
        reservation.status = Reservation.Status.EN_ATTENTE_PAIEMENT
        reservation.save(update_fields=["status", "updated_at"])

    return getattr(payment_intent, "client_secret", None)


def authorize_deposit(
    *,
    reservation,
    requested_by,
    mode,
):
    normalized_mode = _normalize_mode(mode)

    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )

        _validate_reservation_status(reservation_locked)
        client_profile = _validate_request_context(reservation=reservation_locked, requested_by=requested_by)
        _ensure_vehicle_still_available(reservation_locked)
        amount = _recalculate_deposit_amount(reservation_locked)

        if reservation_locked.deposit_amount != amount:
            reservation_locked.deposit_amount = amount
            reservation_locked.save(update_fields=["deposit_amount", "updated_at"])

        deposit = _get_or_create_deposit(
            reservation=reservation_locked,
            mode=normalized_mode,
            amount=amount,
        )

        client_secret = None
        if normalized_mode == Deposit.Mode.SIMULATED:
            _authorize_simulated(
                reservation=reservation_locked,
                deposit=deposit,
                owner=client_profile.user,
            )
        else:
            client_secret = _authorize_stripe_test(
                reservation=reservation_locked,
                deposit=deposit,
            )

        _notify_deposit_authorized_once(
            reservation=reservation_locked,
            deposit=deposit,
            owner=client_profile.user,
        )

    # Important: Stripe manual authorization has a limited validity window.
    # This endpoint does not guarantee a long-term hold until a distant rental date.
    return {
        "deposit": deposit,
        "client_secret": client_secret,
        "reservation": reservation_locked,
        "authorization_note": (
            "Une preautorisation Stripe expire automatiquement apres une duree limitee definie par les reseaux cartes. "
            "Le mode SIMULATED reste le mode de demonstration stable."
        ),
    }
