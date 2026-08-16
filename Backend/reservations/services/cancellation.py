from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from invoicing.models import Invoice, InvoiceLine
from invoicing.services import create_invoice_for_reservation
from notifications.services import create_notification
from payments.models import Payment, Refund
from payments.services.deposits import (
    DepositReleaseError,
    mark_authorized_deposit_for_verification,
    release_authorized_deposit,
)
from reservations.models import Reservation


# ==============================================================================
# Statuts annulables
# ==============================================================================
#
# Le MVP autorise l'annulation de :
#   - BROUILLON
#   - EN_ATTENTE_CAUTION
#   - EN_ATTENTE_PAIEMENT
#   - CONFIRMEE (uniquement si start_at > now())
#
# Le MVP refuse l'annulation de :
#   - EN_COURS (location en cours)
#   - A_CONTROLER (contrôle en cours)
#   - TERMINEE (location terminée)
#   - ANNULEE (déjà annulée)
#   - PAIEMENT_ECHOUE (sauf décision contraire documentée plus tard)


def get_cancellable_statuses():
    """Retourne l'ensemble des statuts annulables au MVP."""
    return {
        Reservation.Status.BROUILLON,
        Reservation.Status.EN_ATTENTE_CAUTION,
        Reservation.Status.EN_ATTENTE_PAIEMENT,
        Reservation.Status.CONFIRMEE,
    }


def is_status_cancellable(status: str, *, reservation: Reservation | None = None) -> bool:
    """
    Vérifie si un statut est annulable.

    Pour CONFIRMEE, vérifie que start_at est dans le futur.
    """
    if status not in get_cancellable_statuses():
        return False

    if status == Reservation.Status.CONFIRMEE:
        if reservation is None:
            return False
        return reservation.start_at > timezone.now()

    return True


# ==============================================================================
# Exceptions métier
# ==============================================================================


@dataclass(frozen=True)
class CancellationError(ValueError):
    """Stable business exception raised by reservation cancellation."""

    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_cancellation_error(
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> None:
    raise CancellationError(code=code, message=message, details=details)


@dataclass(frozen=True)
class CancellationFinancialBreakdown:
    amount_paid: Decimal
    cancellation_fee: Decimal
    refundable_amount: Decimal


@dataclass(frozen=True)
class CancellationPreview:
    can_cancel: bool
    amount_paid: Decimal
    cancellation_fee: Decimal
    refundable_amount: Decimal


FREE_CANCELLATION_WINDOW = timedelta(hours=24)
LATE_CANCELLATION_FEE = Decimal("50.00")


def _get_paid_amount(*, reservation: Reservation) -> Decimal:
    return (
        Payment.objects.filter(reservation=reservation, status=Payment.Status.REUSSI).aggregate(
            total=Coalesce(
                Sum("amount"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )["total"]
        or Decimal("0.00")
    )


def calculate_cancellation_financials(*, reservation: Reservation, now=None) -> CancellationFinancialBreakdown:
    reference_now = now or timezone.now()
    amount_paid = _get_paid_amount(reservation=reservation)

    if (reservation.start_at - reference_now) >= FREE_CANCELLATION_WINDOW:
        cancellation_fee = Decimal("0.00")
    else:
        cancellation_fee = LATE_CANCELLATION_FEE

    refundable_amount = max(Decimal("0.00"), amount_paid - cancellation_fee)
    return CancellationFinancialBreakdown(
        amount_paid=amount_paid,
        cancellation_fee=cancellation_fee,
        refundable_amount=refundable_amount,
    )


def build_cancellation_preview(*, reservation: Reservation, now=None) -> CancellationPreview:
    reference_now = now or timezone.now()
    can_cancel = is_status_cancellable(reservation.status, reservation=reservation)
    financials = calculate_cancellation_financials(reservation=reservation, now=reference_now)
    return CancellationPreview(
        can_cancel=can_cancel,
        amount_paid=financials.amount_paid,
        cancellation_fee=financials.cancellation_fee,
        refundable_amount=financials.refundable_amount,
    )


def _to_minor_units(amount: Decimal) -> int:
    return int((amount * Decimal("100")).quantize(Decimal("1")))


def _format_eur_amount(amount: Decimal) -> str:
    normalized = amount.quantize(Decimal("0.01"))
    return f"{normalized:.2f}".replace(".", ",") + " €"


def _upsert_cancellation_invoice_line(*, invoice: Invoice, label_prefix: str, value_text: str) -> None:
    line = (
        InvoiceLine.objects.select_for_update()
        .filter(
            invoice=invoice,
            line_type=InvoiceLine.LineType.CORRECTION,
            description__startswith=f"{label_prefix}:",
        )
        .order_by("id")
        .first()
    )
    description = f"{label_prefix}: {value_text}"

    if line is None:
        InvoiceLine.objects.create(
            invoice=invoice,
            line_type=InvoiceLine.LineType.CORRECTION,
            description=description,
            quantity=Decimal("1.00"),
            unit_price=Decimal("0.00"),
            total_price=Decimal("0.00"),
        )
        return

    line.description = description
    line.quantity = Decimal("1.00")
    line.unit_price = Decimal("0.00")
    line.total_price = Decimal("0.00")
    line.save(update_fields=["description", "quantity", "unit_price", "total_price"])


def _sync_cancellation_financial_document(
    *,
    reservation: Reservation,
    financials: CancellationFinancialBreakdown,
    cancelled_at,
) -> None:
    invoice = create_invoice_for_reservation(reservation)

    if invoice.status != Invoice.Status.CANCELLED:
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])

    cancellation_date_display = timezone.localtime(cancelled_at).strftime("%d/%m/%Y %H:%M")

    _upsert_cancellation_invoice_line(
        invoice=invoice,
        label_prefix="Annulation - Reservation",
        value_text=f"Reservation annulee le {cancellation_date_display}",
    )
    _upsert_cancellation_invoice_line(
        invoice=invoice,
        label_prefix="Annulation - Montant initial paye",
        value_text=_format_eur_amount(financials.amount_paid),
    )
    _upsert_cancellation_invoice_line(
        invoice=invoice,
        label_prefix="Annulation - Frais",
        value_text=_format_eur_amount(financials.cancellation_fee),
    )
    _upsert_cancellation_invoice_line(
        invoice=invoice,
        label_prefix="Annulation - Montant rembourse",
        value_text=_format_eur_amount(financials.refundable_amount),
    )
    _upsert_cancellation_invoice_line(
        invoice=invoice,
        label_prefix="Annulation - Caution",
        value_text="Liberee",
    )

    # Force la regeneration du PDF pour inclure les informations d'annulation.
    if invoice.pdf_file:
        invoice.pdf_file.delete(save=False)
        invoice.pdf_file = None
        invoice.save(update_fields=["pdf_file", "updated_at"])


def _build_refund_idempotency_key(*, reservation: Reservation, payment: Payment, amount: Decimal) -> str:
    return f"reservation-cancel-refund:{reservation.id}:{payment.id}:{_to_minor_units(amount)}"


def _status_from_stripe_refund(stripe_status: str | None) -> str:
    mapping = {
        "succeeded": Refund.Status.REUSSI,
        "pending": Refund.Status.EN_COURS,
        "requires_action": Refund.Status.EN_COURS,
        "failed": Refund.Status.ECHOUE,
        "canceled": Refund.Status.ANNULE,
    }
    return mapping.get(stripe_status or "", Refund.Status.EN_COURS)


def _configure_stripe_for_refund() -> None:
    stripe_secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not stripe_secret_key:
        _raise_cancellation_error(
            "STRIPE_NOT_CONFIGURED",
            "STRIPE_SECRET_KEY est requis pour effectuer le remboursement.",
        )

    stripe.api_key = stripe_secret_key


def _get_latest_successful_payment(*, reservation: Reservation) -> Payment | None:
    return (
        Payment.objects.select_for_update()
        .filter(
            reservation=reservation,
            status=Payment.Status.REUSSI,
            stripe_payment_intent_id__isnull=False,
        )
        .order_by("-succeeded_at", "-created_at")
        .first()
    )


def _sync_refund_with_stripe(
    *,
    reservation: Reservation,
    payment: Payment,
    requested_by,
    amount: Decimal,
) -> Refund:
    existing_refund = (
        Refund.objects.select_for_update()
        .filter(
            reservation=reservation,
            payment=payment,
            amount=amount,
            currency="EUR",
        )
        .order_by("-created_at")
        .first()
    )

    if existing_refund is not None and existing_refund.status in {
        Refund.Status.DEMANDE,
        Refund.Status.EN_COURS,
        Refund.Status.REUSSI,
    }:
        return existing_refund

    refund = existing_refund
    if refund is None:
        refund = Refund.objects.create(
            payment=payment,
            reservation=reservation,
            amount=amount,
            currency="EUR",
            status=Refund.Status.DEMANDE,
            requested_by=requested_by,
            reason="Annulation de reservation",
        )
    else:
        refund.amount = amount
        refund.currency = "EUR"
        refund.status = Refund.Status.DEMANDE
        refund.requested_by = requested_by
        refund.reason = "Annulation de reservation"
        refund.save(update_fields=["amount", "currency", "status", "requested_by", "reason", "updated_at"])

    _configure_stripe_for_refund()

    try:
        stripe_refund = stripe.Refund.create(
            payment_intent=payment.stripe_payment_intent_id,
            amount=_to_minor_units(amount),
            metadata={
                "reservation_id": str(reservation.id),
                "payment_id": str(payment.id),
                "refund_id": str(refund.id),
                "purpose": "reservation_cancellation",
            },
            idempotency_key=_build_refund_idempotency_key(
                reservation=reservation,
                payment=payment,
                amount=amount,
            ),
        )
    except stripe.error.APIConnectionError:
        _raise_cancellation_error(
            "STRIPE_UNAVAILABLE",
            "Stripe est temporairement indisponible.",
        )
    except stripe.error.StripeError as exc:
        _raise_cancellation_error(
            "STRIPE_ERROR",
            "Erreur Stripe lors du remboursement.",
            details={"stripe_error": str(exc)},
        )

    refund.stripe_refund_id = getattr(stripe_refund, "id", None)
    refund.status = _status_from_stripe_refund(getattr(stripe_refund, "status", None))
    refund.save(update_fields=["stripe_refund_id", "status", "updated_at"])
    return refund


def _execute_cancellation_financial_operations(
    *,
    reservation: Reservation,
    requested_by,
    financials: CancellationFinancialBreakdown,
) -> None:
    if financials.refundable_amount > Decimal("0.00"):
        payment = _get_latest_successful_payment(reservation=reservation)
        if payment is None:
            _raise_cancellation_error(
                "PAYMENT_NOT_FOUND",
                "Aucun paiement Stripe reussi n'a ete trouve pour effectuer le remboursement.",
            )

        _sync_refund_with_stripe(
            reservation=reservation,
            payment=payment,
            requested_by=requested_by,
            amount=financials.refundable_amount,
        )

    mark_authorized_deposit_for_verification(reservation=reservation)
    try:
        release_authorized_deposit(reservation=reservation)
    except DepositReleaseError as exc:
        _raise_cancellation_error(
            "DEPOSIT_RELEASE_FAILED",
            exc.message,
            details=exc.details,
        )


# ==============================================================================
# Service public
# ==============================================================================


def cancel_reservation(
    *,
    reservation: Reservation,
    requested_by,
    reason: str,
) -> Reservation:
    """
    Annule une réservation.

    Vérifie :
      1. La propriété de la réservation (reservation.client.user == requested_by)
      2. Le statut est annulable
      3. Le motif est valide

    Utilise une transaction atomique pour :
      - Revérifier le statut
      - Définir status=ANNULEE
      - Définir cancelled_at=timezone.now()
      - Définir cancellation_reason=reason
      - Sauvegarder uniquement les champs concernés
      - Créer une notification

    Ne supprime pas la réservation.

    Remboursement :
      Une réservation payée annulée devra déclencher un remboursement ultérieur.
      Ce comportement sera géré dans un service dédié (payé) qui sera intégré
      avec le système de paiement et remboursement.

    Args:
        reservation: L'objet Reservation à annuler
        requested_by: L'utilisateur effectuant l'annulation
        reason: Le motif d'annulation (non vide, non seulement espaces)

    Returns:
        La réservation mise à jour avec status=ANNULEE

    Raises:
        CancellationError: Erreur métier (propriété, statut, motif)
    """

    # 1. Vérifier la propriété
    client = getattr(reservation, "client", None)
    if client is None:
        _raise_cancellation_error(
            "INVALID_RESERVATION",
            "La réservation n'a pas de client.",
        )

    owner = getattr(client, "user", None)
    if owner is None:
        _raise_cancellation_error(
            "INVALID_RESERVATION",
            "Le client n'a pas d'utilisateur associé.",
        )

    if owner != requested_by:
        _raise_cancellation_error(
            "FORBIDDEN",
            "Vous ne pouvez annuler que vos propres réservations.",
        )

    # 2. Vérifier le motif (validation minimale avant transaction)
    if not reason or not reason.strip():
        _raise_cancellation_error(
            "INVALID_REASON",
            "Le motif d'annulation est requis.",
        )

    reason_stripped = reason.strip()
    # Longueur maximale cohérente avec le modèle (TextField : aucune limite en DB,
    # mais on applique une limite métier raisonnable)
    if len(reason_stripped) > 1000:
        _raise_cancellation_error(
            "INVALID_REASON",
            "Le motif d'annulation ne doit pas dépasser 1000 caractères.",
            details={"max_length": 1000, "current_length": len(reason_stripped)},
        )

    # 3. Transaction atomique avec select_for_update
    with transaction.atomic():
        # Revérifier le statut sous verrou (prevent race conditions)
        reservation_locked = Reservation.objects.select_for_update().get(pk=reservation.pk)

        if reservation_locked.status == Reservation.Status.ANNULEE:
            _raise_cancellation_error(
                "ALREADY_CANCELLED",
                "La réservation est déjà annulée.",
            )

        if not is_status_cancellable(reservation_locked.status, reservation=reservation_locked):
            _raise_cancellation_error(
                "CANNOT_CANCEL",
                f"Une réservation au statut '{reservation_locked.get_status_display()}' ne peut pas être annulée.",
                details={"current_status": reservation_locked.status},
            )

        financials = calculate_cancellation_financials(reservation=reservation_locked)
        _execute_cancellation_financial_operations(
            reservation=reservation_locked,
            requested_by=requested_by,
            financials=financials,
        )

        cancelled_at = timezone.now()

        # Mettre à jour la réservation
        reservation_locked.status = Reservation.Status.ANNULEE
        reservation_locked.cancelled_at = cancelled_at
        reservation_locked.cancellation_reason = reason_stripped

        # Sauvegarder uniquement les champs concernés
        reservation_locked.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])

        _sync_cancellation_financial_document(
            reservation=reservation_locked,
            financials=financials,
            cancelled_at=cancelled_at,
        )

        # Exposé temporairement sur l'instance retournée pour usage applicatif futur.
        reservation_locked.cancellation_financials = financials

        # La notification est créée après commit pour éviter toute incohérence
        # si la transaction métier est annulée.
        transaction.on_commit(
            lambda: create_notification(
                user=owner,
                notification_type="RESERVATION_CANCELLED",
                title="Reservation annulee",
                message=(
                    "Votre reservation a ete annulee. "
                    f"Remboursement : {_format_eur_amount(financials.refundable_amount)}. "
                    f"Frais : {_format_eur_amount(financials.cancellation_fee)}. "
                    "Caution liberee."
                ),
                related_object_type="reservation",
                related_object_id=reservation_locked.id,
            )
        )

    return reservation_locked
