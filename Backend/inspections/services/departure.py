from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from inspections.models import Inspection, InspectionPhoto
from notifications.services import create_notification
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Vehicle


MANDATORY_PHOTO_TYPES = [
    InspectionPhoto.PhotoType.AVANT,
    InspectionPhoto.PhotoType.ARRIERE,
    InspectionPhoto.PhotoType.COTE_GAUCHE,
    InspectionPhoto.PhotoType.COTE_DROIT,
    InspectionPhoto.PhotoType.INTERIEUR,
    InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
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


def _assert_initial_inspection_can_be_completed(*, inspection: Inspection) -> None:
    if inspection.inspection_type != Inspection.Type.INITIAL:
        _raise_departure_error(
            "INVALID_INSPECTION_TYPE",
            "Seule une inspection INITIAL peut etre cloturee via cet endpoint.",
            details={"inspection_type": inspection.inspection_type},
        )

    if inspection.status == Inspection.Status.TERMINE:
        _raise_departure_error(
            "INSPECTION_ALREADY_COMPLETED",
            "Cette inspection est deja terminee.",
        )


def _assert_mandatory_photos_present(*, inspection: Inspection) -> None:
    existing_types = set(
        inspection.photos.filter(photo_type__in=MANDATORY_PHOTO_TYPES).values_list("photo_type", flat=True)
    )
    missing_photo_types = [photo_type for photo_type in MANDATORY_PHOTO_TYPES if photo_type not in existing_types]
    if missing_photo_types:
        _raise_departure_error(
            "MISSING_MANDATORY_PHOTOS",
            "Les six photos obligatoires doivent etre presentes avant la cloture.",
            details={"missing_photo_types": missing_photo_types},
        )


def _assert_measurements(*, inspection: Inspection, vehicle, mileage: int, energy_level_percent: int) -> None:
    if mileage is None:
        _raise_departure_error("MILEAGE_REQUIRED", "Le kilometrage est obligatoire.")

    if mileage < vehicle.mileage:
        _raise_departure_error(
            "INVALID_MILEAGE",
            "Le kilometrage ne peut pas etre inferieur au kilometrage connu du vehicule.",
            details={"vehicle_mileage": vehicle.mileage, "provided_mileage": mileage},
        )

    if energy_level_percent is None:
        _raise_departure_error("ENERGY_LEVEL_REQUIRED", "Le niveau d'energie est obligatoire.")

    if not 0 <= energy_level_percent <= 100:
        _raise_departure_error(
            "INVALID_ENERGY_LEVEL",
            "Le niveau d'energie doit etre compris entre 0 et 100.",
            details={"provided_energy_level_percent": energy_level_percent},
        )

    if inspection.has_critical_issue:
        _raise_departure_error(
            "CRITICAL_ISSUE_UNRESOLVED",
            "Une inspection avec probleme critique ne peut pas etre cloturee.",
        )

    unresolved_critical_damage_exists = inspection.damages.filter(
        severity=inspection.damages.model.Severity.CRITIQUE,
    ).exclude(
        status__in=[inspection.damages.model.Status.RESOLU, inspection.damages.model.Status.REJETE]
    ).exists()
    if unresolved_critical_damage_exists:
        _raise_departure_error(
            "CRITICAL_DAMAGE_UNRESOLVED",
            "Un dommage critique non traite bloque la cloture de l'inspection.",
        )


def _notify_once(*, user, notification_type: str, title: str, message: str, related_object_type: str, related_object_id: int):
    existing = user.notifications.filter(
        notification_type=notification_type,
        message=message,
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


def _mark_vehicle_access_ready(*, inspection: Inspection) -> None:
    """Integration hook for future vehicle unlock/activation after successful departure completion."""


def complete_departure_inspection(
    *,
    inspection: Inspection,
    requested_by,
    mileage: int,
    energy_level_percent: int,
    comments: str = "",
) -> Inspection:
    with transaction.atomic():
        inspection_locked = (
            Inspection.objects.select_for_update()
            .select_related(
                "reservation",
                "reservation__client",
                "reservation__client__user",
                "reservation__vehicle",
                "reservation__vehicle__brand",
                "reservation__vehicle__category",
                "completed_by",
            )
            .get(pk=inspection.pk)
        )
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=inspection_locked.reservation_id)
        )
        vehicle_locked = Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)

        _assert_request_context(reservation=reservation_locked, requested_by=requested_by)
        _assert_initial_inspection_can_be_completed(inspection=inspection_locked)
        _assert_reservation_is_ready(reservation_locked)
        _assert_departure_window(reservation_locked)
        _assert_mandatory_photos_present(inspection=inspection_locked)
        _assert_measurements(
            inspection=inspection_locked,
            vehicle=vehicle_locked,
            mileage=mileage,
            energy_level_percent=energy_level_percent,
        )

        now = timezone.now()
        cleaned_comments = (comments or "").strip()

        inspection_locked.status = Inspection.Status.TERMINE
        inspection_locked.completed_at = now
        inspection_locked.completed_by = requested_by
        inspection_locked.mileage = mileage
        inspection_locked.energy_level_percent = energy_level_percent
        inspection_locked.comments = cleaned_comments
        inspection_locked.save(
            update_fields=[
                "status",
                "completed_at",
                "completed_by",
                "mileage",
                "energy_level_percent",
                "comments",
                "updated_at",
            ]
        )

        reservation_locked.status = Reservation.Status.EN_COURS
        reservation_locked.save(update_fields=["status", "updated_at"])

        if mileage >= vehicle_locked.mileage:
            vehicle_locked.mileage = mileage
        vehicle_locked.status = Vehicle.Status.LOUE
        vehicle_locked.save(update_fields=["status", "mileage", "updated_at"])

        _mark_vehicle_access_ready(inspection=inspection_locked)

        notification_message = (
            f"L'inspection de depart pour la reservation {reservation_locked.reference} est terminee."
        )
        transaction.on_commit(
            lambda: _notify_once(
                user=reservation_locked.client.user,
                notification_type="DEPARTURE_INSPECTION_COMPLETED",
                title="Inspection de depart terminee",
                message=notification_message,
                related_object_type="Inspection",
                related_object_id=inspection_locked.id,
            )
        )

        inspection.status = inspection_locked.status
        inspection.completed_at = inspection_locked.completed_at
        inspection.completed_by = inspection_locked.completed_by
        inspection.mileage = inspection_locked.mileage
        inspection.energy_level_percent = inspection_locked.energy_level_percent
        inspection.comments = inspection_locked.comments

    return inspection


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