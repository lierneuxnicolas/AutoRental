from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from inspections.models import Damage, Inspection, InspectionPhoto
from inspections.services.departure import DepartureInspectionError
from interventions.models import VehicleAccess
from interventions.services.vehicle_access import VehicleAccessError, lock_and_revoke_after_return
from notifications.services import create_notification
from payments.services import mark_authorized_deposit_for_verification
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


def _raise_return_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    raise DepartureInspectionError(code=code, message=message, details=details)


def _assert_request_context(*, reservation: Reservation, requested_by) -> None:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_return_error("AUTH_REQUIRED", "Authentification requise.")

    owner = getattr(getattr(reservation, "client", None), "user", None)
    if owner is None or owner != requested_by:
        _raise_return_error("FORBIDDEN", "Vous ne pouvez modifier que l'etat des lieux de vos reservations.")


def _assert_return_creation_eligibility(*, reservation: Reservation) -> None:
    if reservation.status != Reservation.Status.EN_COURS:
        _raise_return_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation doit etre EN_COURS pour creer l'etat des lieux de retour.",
            details={"current_status": reservation.status},
        )

    initial_inspection = Inspection.objects.filter(
        reservation=reservation,
        inspection_type=Inspection.Type.INITIAL,
    ).first()
    if initial_inspection is None:
        _raise_return_error(
            "INITIAL_INSPECTION_MISSING",
            "Une inspection INITIAL terminee est requise avant la creation de l'etat des lieux de retour.",
        )

    if initial_inspection.status != Inspection.Status.TERMINE:
        _raise_return_error(
            "INITIAL_INSPECTION_NOT_COMPLETED",
            "L'inspection INITIAL doit etre terminee avant de creer l'etat des lieux de retour.",
            details={"initial_inspection_status": initial_inspection.status},
        )

    final_exists = Inspection.objects.filter(
        reservation=reservation,
        inspection_type=Inspection.Type.FINAL,
    ).exists()
    if final_exists:
        _raise_return_error(
            "RETURN_INSPECTION_ALREADY_EXISTS",
            "Une inspection FINAL existe deja pour cette reservation.",
        )


def _assert_return_completion_eligibility(*, inspection: Inspection, mileage: int, energy_level_percent: int) -> None:
    if inspection.inspection_type != Inspection.Type.FINAL:
        _raise_return_error(
            "INVALID_INSPECTION_TYPE",
            "Seule une inspection FINAL peut etre cloturee via cet endpoint.",
            details={"inspection_type": inspection.inspection_type},
        )

    if inspection.status == Inspection.Status.TERMINE:
        _raise_return_error(
            "INSPECTION_ALREADY_COMPLETED",
            "Cette inspection est deja terminee.",
        )

    if inspection.reservation.status != Reservation.Status.EN_COURS:
        _raise_return_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation doit etre EN_COURS pour cloturer l'etat des lieux de retour.",
            details={"current_status": inspection.reservation.status},
        )

    initial_inspection = Inspection.objects.filter(
        reservation=inspection.reservation,
        inspection_type=Inspection.Type.INITIAL,
    ).first()
    if initial_inspection is None or initial_inspection.status != Inspection.Status.TERMINE:
        _raise_return_error(
            "INITIAL_INSPECTION_NOT_COMPLETED",
            "L'inspection INITIAL doit etre terminee avant la cloture de l'etat des lieux de retour.",
        )

    existing_types = set(
        inspection.photos.filter(photo_type__in=MANDATORY_PHOTO_TYPES).values_list("photo_type", flat=True)
    )
    missing_photo_types = [photo_type for photo_type in MANDATORY_PHOTO_TYPES if photo_type not in existing_types]
    if missing_photo_types:
        _raise_return_error(
            "MISSING_MANDATORY_PHOTOS",
            "Les six photos obligatoires doivent etre presentes avant la cloture.",
            details={"missing_photo_types": missing_photo_types},
        )

    if mileage is None:
        _raise_return_error("MILEAGE_REQUIRED", "Le kilometrage est obligatoire.")

    departure_mileage = initial_inspection.mileage
    if departure_mileage is None:
        _raise_return_error(
            "DEPARTURE_MILEAGE_UNAVAILABLE",
            "Le kilometrage de depart est indisponible, impossible de valider le retour.",
        )

    if mileage < departure_mileage:
        _raise_return_error(
            "INVALID_MILEAGE",
            "Le kilometrage de retour doit etre superieur ou egal au kilometrage de depart.",
            details={"departure_mileage": departure_mileage, "provided_mileage": mileage},
        )

    if energy_level_percent is None:
        _raise_return_error("ENERGY_LEVEL_REQUIRED", "Le niveau d'energie est obligatoire.")

    if not 0 <= energy_level_percent <= 100:
        _raise_return_error(
            "INVALID_ENERGY_LEVEL",
            "Le niveau d'energie doit etre compris entre 0 et 100.",
            details={"provided_energy_level_percent": energy_level_percent},
        )

    if inspection.has_critical_issue and not inspection.damages.exists():
        _raise_return_error(
            "DAMAGES_REQUIRED",
            "Des dommages doivent etre enregistres lorsqu'un probleme est signale.",
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


def _notify_managers_once(*, message: str, related_object_id: int) -> None:
    managers = User.objects.select_related("role").filter(
        is_active=True,
        role__is_active=True,
        role__code=Role.Code.GESTIONNAIRE_COMPTABLE,
    )
    for manager in managers:
        _notify_once(
            user=manager,
            notification_type="VEHICLE_REQUIRES_REVIEW",
            title="Vehicule a controler",
            message=message,
            related_object_type="Inspection",
            related_object_id=related_object_id,
        )


def _integrate_intervention_for_major_or_critical_damage(*, inspection: Inspection) -> None:
    """Integration hook for intervention creation when workflows are implemented."""


def _is_vehicle_already_locked(*, reservation: Reservation) -> bool:
    access = VehicleAccess.objects.filter(reservation=reservation).first()
    if access is None:
        return False

    return access.lock_state == VehicleAccess.LockState.LOCKED


def create_return_inspection(*, reservation: Reservation, requested_by) -> Inspection:
    _assert_request_context(reservation=reservation, requested_by=requested_by)

    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )

        _assert_request_context(reservation=reservation_locked, requested_by=requested_by)
        _assert_return_creation_eligibility(reservation=reservation_locked)

        inspection = Inspection.objects.create(
            reservation=reservation_locked,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.BROUILLON,
            started_at=timezone.now(),
            completed_by=None,
        )

    return inspection


def complete_return_inspection(
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
        _assert_return_completion_eligibility(
            inspection=inspection_locked,
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

        vehicle_already_locked = _is_vehicle_already_locked(reservation=reservation_locked)
        if not vehicle_already_locked:
            try:
                lock_and_revoke_after_return(
                    reservation=reservation_locked,
                    requested_by=requested_by,
                )
            except VehicleAccessError as exc:
                if exc.code != "ALREADY_LOCKED":
                    raise

        has_major_or_critical_damage = inspection_locked.damages.filter(
            severity__in=[Damage.Severity.MAJEUR, Damage.Severity.CRITIQUE]
        ).exists()
        if has_major_or_critical_damage:
            _integrate_intervention_for_major_or_critical_damage(inspection=inspection_locked)

        reservation_locked.status = Reservation.Status.TERMINEE
        reservation_locked.save(update_fields=["status", "updated_at"])

        if mileage >= vehicle_locked.mileage:
            vehicle_locked.mileage = mileage
        vehicle_locked.status = Vehicle.Status.DISPONIBLE
        vehicle_locked.save(update_fields=["status", "mileage", "updated_at"])

        mark_authorized_deposit_for_verification(reservation=reservation_locked)

        client_notification_message = (
            f"L'inspection de retour pour la reservation {reservation_locked.reference} est terminee."
        )
        manager_notification_message = "Un véhicule restitué est en attente de vérification."
        transaction.on_commit(
            lambda: _notify_once(
                user=reservation_locked.client.user,
                notification_type="RETURN_INSPECTION_COMPLETED",
                title="Inspection de retour terminee",
                message=client_notification_message,
                related_object_type="Inspection",
                related_object_id=inspection_locked.id,
            )
        )
        transaction.on_commit(
            lambda: _notify_managers_once(
                message=manager_notification_message,
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