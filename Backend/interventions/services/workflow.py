from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User
from interventions.models import Intervention, TechnicalInspection, TechnicalPhoto, VehicleAccess
from notifications.services import create_notification
from vehicles.models import Vehicle


@dataclass(frozen=True)
class InterventionWorkflowServiceError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _raise_workflow_error(code: str, message: str) -> None:
    raise InterventionWorkflowServiceError(code=code, message=message)


def _resolve_managers_for_notification():
    return User.objects.select_related("role").filter(
        is_active=True,
        role__is_active=True,
        role__code=Role.Code.GESTIONNAIRE_COMPTABLE,
    )


def _assert_vehicle_consistency(*, intervention: Intervention, expected_vehicle_id: int | None = None) -> None:
    if intervention.vehicle_id is None:
        _raise_workflow_error("VEHICLE_REQUIRED", "Le vehicule de l'intervention est obligatoire.")

    if expected_vehicle_id is not None and intervention.vehicle_id != expected_vehicle_id:
        _raise_workflow_error(
            "WRONG_VEHICLE",
            "Le vehicule fourni ne correspond pas a l'intervention.",
        )

    if intervention.reservation_id is not None and intervention.reservation.vehicle_id != intervention.vehicle_id:
        _raise_workflow_error(
            "RESERVATION_VEHICLE_MISMATCH",
            "Le vehicule de l'intervention doit correspondre au vehicule de la reservation.",
        )


def _sync_instance_fields(target: Intervention, source: Intervention) -> None:
    target.status = source.status
    target.started_at = source.started_at
    target.completed_at = source.completed_at
    target.report = source.report
    target.final_cost = source.final_cost
    target.updated_at = source.updated_at


def start_intervention(*, intervention: Intervention, expected_vehicle_id: int | None = None) -> Intervention:
    with transaction.atomic():
        locked = (
            Intervention.objects.select_for_update()
            .select_related("reservation", "vehicle", "assigned_to")
            .get(pk=intervention.pk)
        )

        if locked.status != Intervention.Status.ATTRIBUEE:
            _raise_workflow_error(
                "INVALID_STATUS",
                "L'intervention doit etre ATTRIBUEE pour pouvoir demarrer.",
            )

        if locked.assigned_to_id is None:
            _raise_workflow_error(
                "ASSIGNEE_REQUIRED",
                "Un utilisateur assigne est obligatoire pour demarrer l'intervention.",
            )

        if not locked.assigned_to.is_active:
            _raise_workflow_error(
                "ASSIGNEE_INACTIVE",
                "L'utilisateur assigne est inactif.",
            )

        _assert_vehicle_consistency(intervention=locked, expected_vehicle_id=expected_vehicle_id)

        locked.status = Intervention.Status.EN_COURS
        locked.started_at = timezone.now()
        locked.save(update_fields=["status", "started_at", "updated_at"])

        _sync_instance_fields(intervention, locked)

    return intervention


def _get_or_create_technical_inspection(
    *,
    intervention: Intervention,
    mileage: int | None,
    energy_level_percent: int | None,
    observations: str,
) -> TechnicalInspection:
    technical_inspection = intervention.technical_inspections.order_by("id").first()

    default_mileage = intervention.vehicle.mileage if intervention.vehicle and intervention.vehicle.mileage is not None else 0
    resolved_mileage = default_mileage if mileage is None else mileage
    resolved_energy = 0 if energy_level_percent is None else energy_level_percent

    if resolved_mileage < 0:
        _raise_workflow_error("INVALID_MILEAGE", "Le kilometrage doit etre positif ou nul.")

    if not 0 <= resolved_energy <= 100:
        _raise_workflow_error("INVALID_ENERGY_LEVEL", "Le niveau d'energie doit etre compris entre 0 et 100.")

    cleaned_observations = (observations or "").strip()

    if technical_inspection is None:
        return TechnicalInspection.objects.create(
            intervention=intervention,
            vehicle=intervention.vehicle,
            mileage=resolved_mileage,
            energy_level_percent=resolved_energy,
            observations=cleaned_observations,
        )

    technical_inspection.mileage = resolved_mileage
    technical_inspection.energy_level_percent = resolved_energy
    technical_inspection.observations = cleaned_observations
    technical_inspection.save(update_fields=["mileage", "energy_level_percent", "observations"])
    return technical_inspection


def _create_technical_photos(*, technical_inspection: TechnicalInspection, photos: Iterable) -> int:
    created_count = 0
    for raw_photo in photos:
        if raw_photo is None:
            continue

        caption = ""
        file_obj = raw_photo
        if isinstance(raw_photo, dict):
            file_obj = raw_photo.get("file")
            caption = (raw_photo.get("caption") or "").strip()

        if file_obj is None:
            continue

        TechnicalPhoto.objects.create(
            technical_inspection=technical_inspection,
            file=file_obj,
            caption=caption,
        )
        created_count += 1

    return created_count


def _disable_vehicle_access_temporarily_if_active(*, intervention: Intervention) -> None:
    if intervention.reservation_id is None:
        return

    access = VehicleAccess.objects.select_for_update().filter(reservation_id=intervention.reservation_id).first()
    if access is None or not access.is_active:
        return

    access.is_active = False
    if access.status == VehicleAccess.Status.ACTIVE:
        access.status = VehicleAccess.Status.PENDING
    access.lock_state = VehicleAccess.LockState.LOCKED
    access.save(update_fields=["is_active", "status", "lock_state", "updated_at"])


def complete_intervention(
    *,
    intervention: Intervention,
    report: str,
    final_cost: Decimal | None = None,
    inspection_mileage: int | None = None,
    inspection_energy_level_percent: int | None = None,
    inspection_observations: str = "",
    photos: Iterable | None = None,
) -> Intervention:
    with transaction.atomic():
        locked = (
            Intervention.objects.select_for_update()
            .select_related("reservation", "vehicle", "assigned_to")
            .prefetch_related("technical_inspections__photos")
            .get(pk=intervention.pk)
        )

        if locked.status != Intervention.Status.EN_COURS:
            _raise_workflow_error(
                "INVALID_STATUS",
                "L'intervention doit etre EN_COURS pour etre terminee.",
            )

        cleaned_report = (report or "").strip()
        if not cleaned_report:
            _raise_workflow_error("REPORT_REQUIRED", "Le rapport est obligatoire.")

        technical_inspection = _get_or_create_technical_inspection(
            intervention=locked,
            mileage=inspection_mileage,
            energy_level_percent=inspection_energy_level_percent,
            observations=inspection_observations,
        )

        provided_photos = photos or []
        _create_technical_photos(technical_inspection=technical_inspection, photos=provided_photos)

        has_photos = technical_inspection.photos.exists()
        if not has_photos:
            _raise_workflow_error(
                "PHOTOS_REQUIRED",
                "Au moins une photo est obligatoire pour terminer l'intervention.",
            )

        if final_cost is not None and final_cost < 0:
            _raise_workflow_error("INVALID_FINAL_COST", "Le cout final doit etre positif ou nul.")

        now = timezone.now()
        locked.status = Intervention.Status.TERMINEE
        locked.completed_at = now
        locked.report = cleaned_report
        if final_cost is not None:
            locked.final_cost = final_cost

        locked.save(update_fields=["status", "completed_at", "report", "final_cost", "updated_at"])

        # Aucune remise automatique en DISPONIBLE n'est autorisee ici.
        if locked.vehicle.status != Vehicle.Status.A_CONTROLER:
            locked.vehicle.status = Vehicle.Status.A_CONTROLER
            locked.vehicle.save(update_fields=["status", "updated_at"])

        _disable_vehicle_access_temporarily_if_active(intervention=locked)

        manager_message = (
            f"Intervention {locked.reference} terminee sur le vehicule {locked.vehicle.registration_number}. "
            "Validation finale gestionnaire requise avant disponibilite."
        )
        managers = list(_resolve_managers_for_notification())
        assigned_user = locked.assigned_to
        assigned_message = (
            f"L'intervention {locked.reference} que vous aviez en charge est terminee."
        )
        if assigned_user is not None:
            transaction.on_commit(
                lambda: create_notification(
                    user=assigned_user,
                    notification_type="INTERVENTION_COMPLETED",
                    title="Intervention terminee",
                    message=assigned_message,
                    related_object_type="Intervention",
                    related_object_id=locked.id,
                )
            )
        transaction.on_commit(
            lambda: [
                create_notification(
                    user=manager,
                    notification_type="INTERVENTION_COMPLETED_REVIEW_REQUIRED",
                    title="Intervention terminee - validation requise",
                    message=manager_message,
                    related_object_type="Intervention",
                    related_object_id=locked.id,
                )
                for manager in managers
            ]
        )

        _sync_instance_fields(intervention, locked)

    return intervention