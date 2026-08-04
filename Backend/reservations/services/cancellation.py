from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from notifications.services import create_notification
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

        # Mettre à jour la réservation
        reservation_locked.status = Reservation.Status.ANNULEE
        reservation_locked.cancelled_at = timezone.now()
        reservation_locked.cancellation_reason = reason_stripped

        # Sauvegarder uniquement les champs concernés
        reservation_locked.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])

        # La notification est créée après commit pour éviter toute incohérence
        # si la transaction métier est annulée.
        transaction.on_commit(
            lambda: create_notification(
                user=owner,
                notification_type="RESERVATION_CANCELLED",
                title="Reservation annulee",
                message=f"Votre reservation {reservation_locked.reference} a ete annulee.",
                related_object_type="reservation",
                related_object_id=reservation_locked.id,
            )
        )

    return reservation_locked
