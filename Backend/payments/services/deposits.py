from __future__ import annotations

import logging
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
from accounts.services import check_vehicle_compatibility_for_client, validate_client_for_reservation
from common.models import SystemLog
from common.services import create_system_log
from notifications.services import create_notification
from payments.models import Deposit
from reservations.models import Reservation, ReservationAdditionalCharge
from reservations.services.pricing import PricingError, calculate_price_simulation
from vehicles.services import is_vehicle_available

logger = logging.getLogger(__name__)


@dataclass
class DepositAuthorizationError(ValueError):
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True)
class DepositReleaseError(ValueError):
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True)
class DepositSettlementOperationError(ValueError):
    code: str
    message: str
    http_status: int = 400
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_deposit_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise DepositAuthorizationError(code=code, message=message, details=details)


def _raise_deposit_release_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise DepositReleaseError(code=code, message=message, details=details)


def _raise_deposit_settlement_error(
    code: str,
    message: str,
    *,
    http_status: int = 400,
    details: dict[str, Any] | None = None,
) -> None:
    raise DepositSettlementOperationError(code=code, message=message, http_status=http_status, details=details)


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
        reservation_start_date=timezone.localtime(reservation.start_at).date(),
        reservation_end_date=timezone.localtime(reservation.end_at).date(),
    )
    if not eligibility.is_eligible:
        message = "Le profil client ou les documents ne sont plus valides pour cette reservation."
        if "IDENTITY_CARD_BIRTH_DATE_UNVERIFIED" in eligibility.errors:
            message = "Faites vérifier votre date de naissance par un gestionnaire."
        elif "IDENTITY_CARD_BIRTH_DATE_MISMATCH" in eligibility.errors:
            message = "La date de naissance du profil diffère de celle vérifiée. Corrigez votre profil et contactez le gestionnaire."
        elif "UNDER_MINIMUM_AGE" in eligibility.errors:
            message = "Vous devez avoir au moins 21 ans au début de la location."
        _raise_deposit_error(
            "PROFILE_NOT_ELIGIBLE",
            message,
            details={"eligibility_errors": list(eligibility.errors)},
        )

    compatibility = check_vehicle_compatibility_for_client(client=client_profile, vehicle=reservation.vehicle)
    if not compatibility.is_compatible:
        _raise_deposit_error(
            compatibility.code or "VEHICLE_INCOMPATIBLE_WITH_LICENSE",
            compatibility.message or "Le vehicule est incompatible avec le permis du client.",
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
            is_daily_rate_booking=reservation.is_daily_rate_booking,
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


def _build_release_idempotency_key(*, deposit: Deposit) -> str:
    return f"deposit_release:{deposit.id}:{deposit.stripe_payment_intent_id or 'no-pi'}"


def _release_stripe_deposit_hold(*, deposit: Deposit) -> None:
    if not deposit.stripe_payment_intent_id:
        _raise_deposit_release_error("DEPOSIT_REFERENCE_MISSING", "La référence Stripe de la caution est absente.")

    stripe_api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_api_key:
        _raise_deposit_release_error(
            "STRIPE_NOT_CONFIGURED",
            "STRIPE_SECRET_KEY est requis pour liberer une caution STRIPE_TEST.",
        )

    stripe.api_key = stripe_api_key

    try:
        payment_intent = stripe.PaymentIntent.retrieve(deposit.stripe_payment_intent_id)
    except stripe.error.APIConnectionError:
        _raise_deposit_release_error("STRIPE_UNAVAILABLE", "Stripe est temporairement indisponible.")
    except stripe.error.StripeError as exc:
        _raise_deposit_release_error(
            "STRIPE_ERROR",
            "Impossible de verifier la preautorisation Stripe de caution.",
            details={"stripe_error": str(exc)},
        )

    stripe_status = getattr(payment_intent, "status", "")
    if stripe_status == "canceled":
        return
    if stripe_status == "succeeded":
        _raise_deposit_release_error("DEPOSIT_ALREADY_CAPTURED", "La caution Stripe a été capturée ; elle ne peut pas être déclarée libérée.")

    try:
        canceled_intent = stripe.PaymentIntent.cancel(
            deposit.stripe_payment_intent_id,
            cancellation_reason="abandoned",
            idempotency_key=_build_release_idempotency_key(deposit=deposit),
        )
        if getattr(canceled_intent, "status", None) != "canceled":
            _raise_deposit_release_error("DEPOSIT_RELEASE_UNCONFIRMED", "Stripe n'a pas confirmé la libération de la caution.")
    except stripe.error.InvalidRequestError as exc:
        error_code = getattr(exc, "code", None)
        if error_code == "payment_intent_unexpected_state":
            _raise_deposit_release_error("DEPOSIT_STATE_CHANGED", "L'état de la caution Stripe a changé ; vérifiez-la avant de réessayer.")
        _raise_deposit_release_error(
            "STRIPE_ERROR",
            "Stripe refuse la liberation de la caution.",
            details={"stripe_error": str(exc)},
        )
    except stripe.error.APIConnectionError:
        _raise_deposit_release_error("STRIPE_UNAVAILABLE", "Stripe est temporairement indisponible.")
    except stripe.error.StripeError as exc:
        _raise_deposit_release_error(
            "STRIPE_ERROR",
            "Erreur Stripe lors de la liberation de la caution.",
            details={"stripe_error": str(exc)},
        )


def release_authorized_deposit(*, reservation: Reservation) -> Deposit | None:
    deposit = (
        Deposit.objects.select_for_update()
        .filter(reservation=reservation, status=Deposit.Status.A_VERIFIER)
        .order_by("-authorized_at", "-created_at")
        .first()
    )
    if deposit is None:
        return None

    if deposit.mode == Deposit.Mode.STRIPE_TEST:
        _release_stripe_deposit_hold(deposit=deposit)

    now = timezone.now()
    deposit.status = Deposit.Status.LIBEREE
    deposit.released_at = now
    deposit.authorization_expires_at = None
    deposit.save(update_fields=["status", "released_at", "authorization_expires_at", "updated_at"])
    return deposit


def mark_authorized_deposit_for_verification(*, reservation: Reservation) -> Deposit | None:
    deposit = (
        Deposit.objects.select_for_update()
        .filter(reservation=reservation, status=Deposit.Status.AUTORISEE)
        .order_by("-authorized_at", "-created_at")
        .first()
    )
    if deposit is None:
        return None

    deposit.status = Deposit.Status.A_VERIFIER
    deposit.save(update_fields=["status", "updated_at"])
    return deposit


def release_reservation_deposit_for_management(*, reservation: Reservation, requested_by) -> Deposit:
    """Release whichever deposit is still AUTORISEE or A_VERIFIER for this reservation.

    Reuses mark_authorized_deposit_for_verification + release_authorized_deposit as-is:
    no new Stripe logic is introduced here.
    """

    with transaction.atomic():
        locked_reservation = Reservation.objects.select_for_update().get(pk=reservation.pk)
        mark_authorized_deposit_for_verification(reservation=locked_reservation)
        deposit = release_authorized_deposit(reservation=locked_reservation)

        if deposit is None:
            _raise_deposit_release_error(
                "NO_DEPOSIT_TO_RELEASE",
                "Aucune caution autorisee ou a verifier n'a ete trouvee pour cette reservation.",
            )

    return deposit


@dataclass(frozen=True)
class DepositSettlementResult:
    """Resultat de la regularisation unique de caution (operation 4.3)."""

    deposit: Deposit
    deposit_amount: Decimal
    charges_total: Decimal
    captured_amount: Decimal
    released_amount: Decimal
    over_deposit_amount: Decimal
    stripe_payment_intent_id: str | None


_SETTLEABLE_DEPOSIT_STATUSES = {Deposit.Status.AUTORISEE, Deposit.Status.A_VERIFIER}


def _build_settle_capture_idempotency_key(*, deposit: Deposit, amount_minor: int) -> str:
    return f"deposit_settle_capture:{deposit.id}:{deposit.stripe_payment_intent_id or 'no-pi'}:{amount_minor}"


def _assert_settlement_requested_by_manager(requested_by) -> None:
    role_code = getattr(getattr(requested_by, "role", None), "code", None)
    if not getattr(requested_by, "is_superuser", False) and role_code not in {"GESTIONNAIRE_COMPTABLE", "ADMINISTRATEUR"}:
        _raise_deposit_settlement_error(
            "FORBIDDEN",
            "Cette action est reservee aux gestionnaires-comptables ou aux administrateurs.",
            http_status=403,
        )


def _get_deposit_for_settlement(*, reservation: Reservation) -> Deposit:
    deposit = (
        Deposit.objects.select_for_update()
        .filter(reservation=reservation)
        .order_by("-authorized_at", "-created_at", "-id")
        .first()
    )
    if deposit is None:
        _raise_deposit_settlement_error(
            "DEPOSIT_NOT_FOUND",
            "Aucune caution n'est disponible pour cette reservation.",
            http_status=409,
        )
    return deposit


def _expire_stale_deposit_authorization(*, reservation: Reservation) -> None:
    """Marque EXPIREE (transaction dediee) une preautorisation dont la fenetre est depassee.

    La transition est committee independamment pour conserver la trace meme si
    l'operation de regularisation echoue ensuite.
    """
    now = timezone.now()
    with transaction.atomic():
        deposit = (
            Deposit.objects.select_for_update()
            .filter(
                reservation=reservation,
                status__in=_SETTLEABLE_DEPOSIT_STATUSES,
                authorization_expires_at__isnull=False,
                authorization_expires_at__lte=now,
            )
            .order_by("-authorized_at", "-created_at", "-id")
            .first()
        )
        if deposit is None:
            return
        deposit.status = Deposit.Status.EXPIREE
        deposit.failed_at = now
        deposit.save(update_fields=["status", "failed_at", "updated_at"])
        _log_deposit_settlement(
            action="DEPOSIT_AUTHORIZATION_EXPIRED",
            level=SystemLog.Level.WARNING,
            deposit=deposit,
            reservation=reservation,
            user=None,
            suffix="Preautorisation expiree detectee avant regularisation.",
        )


def _log_deposit_settlement(*, action: str, level, deposit: Deposit, reservation: Reservation, user, suffix: str = "") -> None:
    try:
        message = (
            f"Deposit id={deposit.id}, reservation={reservation.reference} (id={reservation.id}), "
            f"amount={deposit.amount} {deposit.currency}, "
            f"stripe_payment_intent={deposit.stripe_payment_intent_id or 'aucun'}."
        )
        if suffix:
            message = f"{message} {suffix}"
        create_system_log(user=user, action=action, message=message, level=level)
    except Exception:  # pragma: no cover - le log ne doit jamais faire echouer l'operation
        logger.exception("Impossible d'ecrire le journal systeme pour la regularisation de caution.")


def _capture_stripe_deposit(*, deposit: Deposit, amount_to_capture: Decimal, require_full_amount: bool = False) -> Decimal:
    """Capture partiellement/totalement la preautorisation Stripe et retourne le montant capture.

    Ne capture jamais plus que le montant reellement capturable annonce par Stripe.
    """
    if not deposit.stripe_payment_intent_id:
        _raise_deposit_settlement_error(
            "DEPOSIT_REFERENCE_MISSING",
            "La référence Stripe de la caution est absente.",
            http_status=409,
        )

    stripe_api_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_api_key:
        _raise_deposit_settlement_error(
            "STRIPE_NOT_CONFIGURED",
            "STRIPE_SECRET_KEY est requis pour regulariser une caution STRIPE_TEST.",
            http_status=503,
        )
    stripe.api_key = stripe_api_key

    try:
        payment_intent = stripe.PaymentIntent.retrieve(deposit.stripe_payment_intent_id)
    except stripe.error.APIConnectionError:
        _raise_deposit_settlement_error("STRIPE_UNAVAILABLE", "Stripe est temporairement indisponible.", http_status=503)
    except stripe.error.StripeError as exc:
        _raise_deposit_settlement_error(
            "STRIPE_ERROR",
            "Impossible de verifier la preautorisation Stripe de caution.",
            http_status=502,
            details={"stripe_error": str(exc)},
        )

    stripe_status = getattr(payment_intent, "status", "")
    if stripe_status == "canceled":
        _raise_deposit_settlement_error(
            "DEPOSIT_AUTHORIZATION_EXPIRED",
            "La preautorisation Stripe n'est plus active (annulee ou expiree) ; aucune capture n'est possible.",
            http_status=409,
        )
    if stripe_status == "succeeded":
        _raise_deposit_settlement_error(
            "DEPOSIT_ALREADY_CAPTURED",
            "La caution Stripe a deja ete capturee.",
            http_status=409,
        )
    if stripe_status != "requires_capture":
        _raise_deposit_settlement_error(
            "DEPOSIT_NOT_CAPTURABLE",
            "La preautorisation Stripe n'est pas dans un etat capturable.",
            http_status=409,
            details={"stripe_status": stripe_status},
        )

    amount_capturable_minor = int(getattr(payment_intent, "amount_capturable", 0) or 0)
    requested_minor = _to_minor_units(amount_to_capture)
    capture_minor = min(requested_minor, amount_capturable_minor)
    if require_full_amount and capture_minor < requested_minor:
        _raise_deposit_settlement_error(
            "INSUFFICIENT_CAPTURABLE_AMOUNT",
            "Le montant capturable Stripe ne couvre plus les frais confirmés.",
            http_status=409,
        )
    if capture_minor <= 0:
        _raise_deposit_settlement_error(
            "DEPOSIT_NOT_CAPTURABLE",
            "Aucun montant capturable n'est disponible sur la preautorisation Stripe.",
            http_status=409,
        )

    try:
        captured_intent = stripe.PaymentIntent.capture(
            deposit.stripe_payment_intent_id,
            amount_to_capture=capture_minor,
            idempotency_key=_build_settle_capture_idempotency_key(deposit=deposit, amount_minor=capture_minor),
        )
    except stripe.error.InvalidRequestError as exc:
        if getattr(exc, "code", None) == "payment_intent_unexpected_state":
            _raise_deposit_settlement_error(
                "DEPOSIT_STATE_CHANGED",
                "L'etat de la caution Stripe a change ; verifiez-la avant de reessayer.",
                http_status=409,
            )
        _raise_deposit_settlement_error(
            "STRIPE_ERROR",
            "Stripe refuse la capture de la caution.",
            http_status=502,
            details={"stripe_error": str(exc)},
        )
    except stripe.error.APIConnectionError:
        _raise_deposit_settlement_error("STRIPE_UNAVAILABLE", "Stripe est temporairement indisponible.", http_status=503)
    except stripe.error.StripeError as exc:
        _raise_deposit_settlement_error(
            "STRIPE_ERROR",
            "Erreur Stripe lors de la capture de la caution.",
            http_status=502,
            details={"stripe_error": str(exc)},
        )

    if getattr(captured_intent, "status", None) != "succeeded":
        _raise_deposit_settlement_error(
            "DEPOSIT_CAPTURE_UNCONFIRMED",
            "Stripe n'a pas confirme la capture de la caution.",
            http_status=502,
        )

    return (Decimal(capture_minor) / Decimal("100")).quantize(Decimal("0.01"))


def settle_reservation_deposit(*, reservation: Reservation, requested_by, check_confirmation=None) -> DepositSettlementResult:
    """Regularise la caution d'une reservation A_CONTROLER en une operation unique.

    - frais = 0 EUR : annule la preautorisation (liberation integrale) ;
    - frais > 0 EUR : capture min(frais, caution, montant capturable Stripe) ;
      Stripe libere automatiquement le reliquat non capture.
    En cas d'erreur, aucun etat local n'est modifie : la caution n'est jamais
    annoncee liberee et la reservation n'est pas cloturee.
    """
    from reservations.services.additional_charges import calculate_deposit_settlement

    _assert_settlement_requested_by_manager(requested_by)
    _expire_stale_deposit_authorization(reservation=reservation)

    with transaction.atomic():
        locked = Reservation.objects.select_for_update().get(pk=reservation.pk)

        if locked.status != Reservation.Status.A_CONTROLER:
            _raise_deposit_settlement_error(
                "INVALID_STATUS",
                "La reservation doit etre A_CONTROLER pour regulariser la caution.",
                http_status=409,
            )

        deposit = _get_deposit_for_settlement(reservation=locked)

        if deposit.status in {Deposit.Status.CAPTUREE, Deposit.Status.LIBEREE}:
            _raise_deposit_settlement_error(
                "DEPOSIT_ALREADY_SETTLED",
                "La caution de cette reservation a deja ete regularisee.",
                http_status=409,
            )
        if deposit.status == Deposit.Status.EXPIREE:
            _raise_deposit_settlement_error(
                "DEPOSIT_AUTHORIZATION_EXPIRED",
                "La preautorisation de caution a expire ; aucune regularisation automatique n'est possible.",
                http_status=409,
            )
        if deposit.status not in _SETTLEABLE_DEPOSIT_STATUSES:
            _raise_deposit_settlement_error(
                "DEPOSIT_STATUS_INVALID",
                "La caution doit etre AUTORISEE ou A_VERIFIER pour etre regularisee.",
                http_status=409,
                details={"deposit_status": deposit.status},
            )

        if check_confirmation is not None:
            check_confirmation(locked, deposit)
        settlement = calculate_deposit_settlement(reservation=locked)
        amount_to_capture = min(settlement.retained_amount, deposit.amount)
        now = timezone.now()

        captured_amount = Decimal("0.00")
        if amount_to_capture > 0:
            if deposit.mode == Deposit.Mode.STRIPE_TEST:
                captured_amount = _capture_stripe_deposit(
                    deposit=deposit, amount_to_capture=amount_to_capture,
                    require_full_amount=check_confirmation is not None,
                )
            else:
                captured_amount = amount_to_capture
            deposit.status = Deposit.Status.CAPTUREE
            deposit.captured_at = now
            deposit.captured_amount = captured_amount
            deposit.authorization_expires_at = None
            deposit.save(update_fields=["status", "captured_at", "captured_amount", "authorization_expires_at", "updated_at"])
        else:
            if deposit.mode == Deposit.Mode.STRIPE_TEST:
                try:
                    _release_stripe_deposit_hold(deposit=deposit)
                except DepositReleaseError as exc:
                    http_status = 503 if exc.code == "STRIPE_UNAVAILABLE" else 409
                    _raise_deposit_settlement_error(exc.code, exc.message, http_status=http_status, details=exc.details)
            deposit.status = Deposit.Status.LIBEREE
            deposit.released_at = now
            deposit.authorization_expires_at = None
            deposit.save(update_fields=["status", "released_at", "authorization_expires_at", "updated_at"])

        released_amount = (deposit.amount - captured_amount).quantize(Decimal("0.01"))
        if released_amount < 0:
            released_amount = Decimal("0.00")

        # Trace de la decision : les lignes provisoires deviennent VALIDEE.
        ReservationAdditionalCharge.objects.filter(
            reservation=locked,
            status=ReservationAdditionalCharge.Status.PROVISOIRE,
        ).update(status=ReservationAdditionalCharge.Status.VALIDEE, updated_at=now)

        _log_deposit_settlement(
            action="DEPOSIT_SETTLED",
            level=SystemLog.Level.INFO,
            deposit=deposit,
            reservation=locked,
            user=requested_by,
            suffix=(
                f"Frais retenus={settlement.charges_total} EUR, capture={captured_amount} EUR, "
                f"libere={released_amount} EUR, depassement={settlement.over_deposit_amount} EUR."
            ),
        )

    # Facture complementaire automatique apres regularisation confirmee.
    # Best-effort : la capture Stripe est deja effective, un echec de facturation
    # ne doit jamais remettre en cause l'etat regularise (trace en log pour reprise).
    if captured_amount > 0:
        try:
            from invoicing.services import create_additional_charges_invoice
            from invoicing.services.pdf_generator import ensure_invoice_pdf

            invoice = create_additional_charges_invoice(locked)
            if invoice is not None:
                ensure_invoice_pdf(invoice)
        except Exception:
            logger.exception(
                "La facture complementaire n'a pas pu etre generee pour la reservation %s.", locked.pk
            )

    return DepositSettlementResult(
        deposit=deposit,
        deposit_amount=settlement.deposit_amount,
        charges_total=settlement.charges_total,
        captured_amount=captured_amount,
        released_amount=released_amount,
        over_deposit_amount=settlement.over_deposit_amount,
        stripe_payment_intent_id=deposit.stripe_payment_intent_id,
    )



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

    try:
        payment_intent = stripe.PaymentIntent.create(
            amount=_to_minor_units(deposit.amount),
            currency="eur",
            capture_method="manual",
            metadata=metadata,
            idempotency_key=_build_idempotency_key(deposit=deposit),
        )
    except stripe.error.APIConnectionError:
        _raise_deposit_error(
            "STRIPE_UNAVAILABLE",
            "Stripe est temporairement indisponible.",
        )
    except stripe.error.CardError as exc:
        _raise_deposit_error(
            "STRIPE_CARD_DECLINED",
            "La preautorisation de caution a ete refusee par Stripe.",
            details={"stripe_error": str(exc)},
        )
    except stripe.error.StripeError as exc:
        _raise_deposit_error(
            "STRIPE_ERROR",
            "Erreur Stripe lors de la preautorisation de la caution.",
            details={"stripe_error": str(exc)},
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
        draft_expired = False
        if reservation_locked.status == Reservation.Status.BROUILLON:
            from reservations.services.expiration import expire_draft_reservation_if_stale

            draft_expired = expire_draft_reservation_if_stale(reservation=reservation_locked, reference_time=timezone.now())

    # The expiration transition above must be committed on its own: raising inside the
    # same atomic block would roll back the cancellation together with the error.
    if draft_expired:
        _raise_deposit_error(
            "DRAFT_EXPIRED",
            "Le brouillon de reservation a expire (delai de 15 minutes depasse). Veuillez creer une nouvelle reservation.",
        )

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
