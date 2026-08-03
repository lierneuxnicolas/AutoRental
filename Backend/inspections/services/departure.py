from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from inspections.models import Inspection, InspectionPhoto
from payments.models import Deposit, Payment
from reservations.models import Reservation


MANDATORY_PHOTO_TYPES = [
    InspectionPhoto.PhotoType.AVANT,
    InspectionPhoto.PhotoType.ARRIERE,
    InspectionPhoto.PhotoType.COTE_GAUCHE,
    InspectionPhoto.PhotoType.COTE_DROIT,
    InspectionPhoto.PhotoType.INTERIEUR,
    InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
    InspectionPhoto.PhotoType.DOMMAGE,
    InspectionPhoto.PhotoType.AUTRE,
]

MISSING_FIELDS = [
    "mileage",
    "energy_level_percent",
    "comments",
    "has_critical_issue",
    "critical_issue_description",
]


@dataclass(frozen=True)
class DepartureInspectionError(ValueError):
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_departure_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise DepartureInspectionError(code=code, message=message, details=details)


def _assert_request_context(*, reservation: Reservation, requested_by) -> None:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_departure_error("AUTH_REQUIRED", "Authentification requise.")

    owner = getattr(getattr(reservation, "client", None), "user", None)
    if owner is None or owner != requested_by:
        _raise_departure_error("FORBIDDEN", "Vous ne pouvez creer que l'etat des lieux de vos reservations.")


def _assert_reservation_is_ready(reservation: Reservation) -> None:
    if reservation.status != Reservation.Status.CONFIRMEE:
        _raise_departure_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation doit etre CONFIRMEE pour creer l'etat des lieux de depart.",
            details={"current_status": reservation.status},
        )

    payment = (
        Payment.objects.filter(reservation=reservation, status=Payment.Status.REUSSI)
        .order_by("-succeeded_at", "-created_at")
        .first()
    )
    if payment is None:
        _raise_departure_error(
            "PAYMENT_NOT_SUCCESSFUL",
            "Un paiement REUSSI est requis avant la creation de l'etat des lieux de depart.",
        )

    deposit = (
        Deposit.objects.filter(reservation=reservation, status=Deposit.Status.AUTORISEE)
        .order_by("-authorized_at", "-created_at")
        .first()
    )
    if deposit is None:
        _raise_departure_error(
            "DEPOSIT_NOT_AUTHORIZED",
            "Une caution AUTORISEE est requise avant la creation de l'etat des lieux de depart.",
        )


def _assert_departure_window(reservation: Reservation) -> None:
    now = timezone.now()
    early_tolerance = timedelta(minutes=getattr(settings, "DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES", 30))
    late_tolerance = timedelta(minutes=getattr(settings, "DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES", 120))

    earliest_allowed = reservation.start_at - early_tolerance
    latest_allowed = reservation.start_at + late_tolerance

    if now < earliest_allowed:
        _raise_departure_error(
            "TOO_EARLY",
            "L'heure de depart n'est pas encore atteinte.",
            details={
                "start_at": reservation.start_at,
                "earliest_allowed_at": earliest_allowed,
                "current_time": now,
            },
        )

    if now > latest_allowed:
        _raise_departure_error(
            "TOO_LATE",
            "Le delai autorise pour creer l'etat des lieux de depart est depasse.",
            details={
                "start_at": reservation.start_at,
                "latest_allowed_at": latest_allowed,
                "current_time": now,
            },
        )


def _assert_no_existing_initial_inspection(reservation: Reservation) -> None:
    if Inspection.objects.filter(reservation=reservation, inspection_type=Inspection.Type.INITIAL).exists():
        _raise_departure_error(
            "INSPECTION_ALREADY_EXISTS",
            "Une inspection INITIAL existe deja pour cette reservation.",
        )


def create_departure_inspection(*, reservation: Reservation, requested_by) -> Inspection:
    _assert_request_context(reservation=reservation, requested_by=requested_by)

    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )

        _assert_request_context(reservation=reservation_locked, requested_by=requested_by)
        _assert_reservation_is_ready(reservation_locked)
        _assert_departure_window(reservation_locked)
        _assert_no_existing_initial_inspection(reservation_locked)

        inspection = Inspection.objects.create(
            reservation=reservation_locked,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.BROUILLON,
            started_at=timezone.now(),
            completed_by=None,
        )

    return inspection