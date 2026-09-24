from __future__ import annotations

import json
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from interventions.models import Intervention, TechnicalInspection, TechnicalPhoto
from vehicles.models import Vehicle


@dataclass(frozen=True)
class InterventionWorkflowError(ValueError):
    code: str
    message: str
    http_status: int = 400

    def __str__(self) -> str:
        return self.message


def _raise_workflow_error(code: str, message: str, *, http_status: int = 400) -> None:
    raise InterventionWorkflowError(code=code, message=message, http_status=http_status)


def _assigned_queryset_for(*, user, intervention_type: str):
    return (
        Intervention.objects.select_related(
            "vehicle",
            "vehicle__brand",
            "reservation",
            "assigned_to",
            "assigned_to__role",
            "created_by",
            "created_by__role",
        )
        .filter(assigned_to=user, intervention_type=intervention_type)
        .order_by("-created_at", "-id")
    )


def list_assigned_interventions(*, user, intervention_type: str):
    return _assigned_queryset_for(user=user, intervention_type=intervention_type)


def get_assigned_intervention(*, user, intervention_type: str, intervention_id: int):
    intervention = _assigned_queryset_for(user=user, intervention_type=intervention_type).filter(id=intervention_id).first()
    if intervention is None:
        _raise_workflow_error(
            "INTERVENTION_NOT_FOUND",
            "Intervention introuvable pour cet utilisateur.",
            http_status=404,
        )
    return intervention


def start_assigned_intervention(*, intervention):
    with transaction.atomic():
        locked = Intervention.objects.select_for_update().prefetch_related("technical_inspections").get(pk=intervention.pk)

        if locked.status == Intervention.Status.ANNULEE:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Une intervention annulee ne peut pas etre demarree.",
                http_status=409,
            )

        if locked.status == Intervention.Status.TERMINEE:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Une intervention terminee ne peut pas etre redemarree.",
                http_status=409,
            )

        if locked.status == Intervention.Status.A_ATTRIBUER:
            _raise_workflow_error(
                "NOT_ASSIGNED",
                "Cette intervention doit etre attribuee avant demarrage.",
                http_status=409,
            )

        check_in = locked.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
        if check_in is None or not check_in.observations.strip():
            _raise_workflow_error(
                "CHECK_IN_REQUIRED",
                "Le check-in est obligatoire avant de commencer l'intervention.",
                http_status=409,
            )

        if locked.status == Intervention.Status.ATTRIBUEE:
            locked.status = Intervention.Status.EN_COURS
            if locked.started_at is None:
                locked.started_at = timezone.now()
            locked.save(update_fields=["status", "started_at", "updated_at"])

            locked.vehicle.status = (
                Vehicle.Status.MAINTENANCE
                if locked.intervention_type == Intervention.Type.MECANIQUE
                else Vehicle.Status.NETTOYAGE
            )
            locked.vehicle.save(update_fields=["status", "updated_at"])

        intervention.status = locked.status
        intervention.started_at = locked.started_at

    return intervention


def _build_check_in_observations(*, observations: str, vehicle_condition: str = "", cleanliness_state: str = "", cleanliness_notes: str = "") -> str:
    parts = []
    cleaned_observations = (observations or "").strip()
    if cleaned_observations:
        parts.append(cleaned_observations)

    cleaned_vehicle_condition = (vehicle_condition or "").strip()
    if cleaned_vehicle_condition:
        parts.append(f"Etat general du vehicule: {cleaned_vehicle_condition}")

    cleaned_cleanliness_state = (cleanliness_state or "").strip()
    if cleaned_cleanliness_state:
        parts.append(f"Etat de proprete: {cleaned_cleanliness_state}")

    cleaned_cleanliness_notes = (cleanliness_notes or "").strip()
    if cleaned_cleanliness_notes:
        parts.append(f"Salissures / odeurs / dechets constates: {cleaned_cleanliness_notes}")

    return "\n".join(parts).strip()


def check_in_assigned_intervention(
    *,
    intervention,
    mileage: int,
    observations: str,
    vehicle_condition: str = "",
    cleanliness_state: str = "",
    cleanliness_notes: str = "",
    photos=None,
):
    if mileage < 0:
        _raise_workflow_error("INVALID_MILEAGE", "Le kilometrage doit etre positif ou nul.")

    cleaned_observations = _build_check_in_observations(
        observations=observations,
        vehicle_condition=vehicle_condition,
        cleanliness_state=cleanliness_state,
        cleanliness_notes=cleanliness_notes,
    )
    if not cleaned_observations:
        _raise_workflow_error("OBSERVATIONS_REQUIRED", "Les observations sont obligatoires.")

    photo_files = list(photos or [])
    if not photo_files:
        _raise_workflow_error("PHOTOS_REQUIRED", "Au moins une photo avant intervention est obligatoire.")

    with transaction.atomic():
        locked = Intervention.objects.select_for_update().select_related("vehicle").get(pk=intervention.pk)

        if locked.status != Intervention.Status.ATTRIBUEE:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Le check-in est possible uniquement sur une intervention attribuee.",
                http_status=409,
            )

        technical_inspection = locked.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
        if technical_inspection is None:
            technical_inspection = TechnicalInspection.objects.create(
                intervention=locked,
                vehicle=locked.vehicle,
            phase=TechnicalInspection.Phase.INITIAL,
                mileage=mileage,
                energy_level_percent=0,
                observations=cleaned_observations,
            )
        else:
            technical_inspection.mileage = mileage
            technical_inspection.energy_level_percent = 0
            technical_inspection.observations = cleaned_observations
            technical_inspection.save(update_fields=["mileage", "energy_level_percent", "observations"])

        for uploaded_file in photo_files:
            TechnicalPhoto.objects.create(
                technical_inspection=technical_inspection,
                file=uploaded_file,
                caption="Avant intervention",
            )

    return start_assigned_intervention(intervention=intervention)


def _get_or_create_technical_inspection(*, intervention):
    technical_inspection = intervention.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
    if technical_inspection is not None:
        return technical_inspection

    fallback_mileage = max(getattr(intervention.vehicle, "mileage", 0) or 0, 0)
    return TechnicalInspection.objects.create(
        intervention=intervention,
        vehicle=intervention.vehicle,
        phase=TechnicalInspection.Phase.INITIAL,
        mileage=fallback_mileage,
        energy_level_percent=0,
        observations="",
    )


def add_assigned_intervention_photo(*, intervention, uploaded_file, caption: str = ""):
    with transaction.atomic():
        locked = Intervention.objects.select_for_update().select_related("vehicle").get(pk=intervention.pk)

        if locked.status != Intervention.Status.EN_COURS:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Les photos ne peuvent etre ajoutees que sur une intervention EN_COURS.",
                http_status=409,
            )

        technical_inspection = _get_or_create_technical_inspection(intervention=locked)
        photo = TechnicalPhoto.objects.create(
            technical_inspection=technical_inspection,
            file=uploaded_file,
            caption=(caption or "").strip(),
        )

    return photo


def complete_assigned_intervention(*, intervention, report: str = ""):
    with transaction.atomic():
        locked = Intervention.objects.select_for_update().get(pk=intervention.pk)

        if locked.status == Intervention.Status.ANNULEE:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Une intervention annulee ne peut pas etre terminee.",
                http_status=409,
            )

        if locked.status == Intervention.Status.TERMINEE:
            return locked

        if locked.status != Intervention.Status.EN_COURS:
            _raise_workflow_error(
                "INVALID_STATUS",
                "L'intervention doit etre EN_COURS avant cloture.",
                http_status=409,
            )

        now = timezone.now()
        locked.status = Intervention.Status.TERMINEE
        locked.completed_at = now
        locked.report = (report or "").strip()
        locked.save(update_fields=["status", "completed_at", "report", "updated_at"])

    return locked


def save_assigned_intervention_work(*, intervention, work_data: dict, estimated_cost=None):
    if not isinstance(work_data, dict):
        _raise_workflow_error("INVALID_WORK_DATA", "Les donnees de travail doivent etre un objet.")

    with transaction.atomic():
        locked = Intervention.objects.select_for_update().get(pk=intervention.pk)

        if locked.status != Intervention.Status.EN_COURS:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Le travail peut etre enregistre uniquement sur une intervention EN_COURS.",
                http_status=409,
            )

        locked.report = json.dumps({"work_in_progress": work_data}, ensure_ascii=False)
        locked.estimated_cost = estimated_cost
        locked.save(update_fields=["report", "estimated_cost", "updated_at"])

        intervention.report = locked.report
        intervention.estimated_cost = locked.estimated_cost
        intervention.updated_at = locked.updated_at

    return intervention


def _final_report_payload(*, intervention, check_in, check_out, work_data, estimated_cost, final_payload):
    vehicle = intervention.vehicle
    return {
        "vehicle": {
            "id": vehicle.id,
            "brand": vehicle.brand.name,
            "model_name": vehicle.model_name,
            "registration_number": vehicle.registration_number,
            "parking_name": vehicle.parking_space.parking.name,
            "parking_space_number": vehicle.parking_space.number,
        },
        "assignee": intervention.assigned_to.email if intervention.assigned_to else None,
        "intervention_type": intervention.intervention_type,
        "description": intervention.description,
        "started_at": intervention.started_at.isoformat() if intervention.started_at else None,
        "completed_at": intervention.completed_at.isoformat() if intervention.completed_at else None,
        "check_in": {
            "mileage": check_in.mileage,
            "observations": check_in.observations,
            "photo_ids": list(check_in.photos.values_list("id", flat=True)),
        },
        "work": work_data,
        "estimated_cost": str(estimated_cost) if estimated_cost is not None else None,
        "check_out": {
            **final_payload,
            "mileage": check_out.mileage,
            "observations": check_out.observations,
            "photo_ids": list(check_out.photos.values_list("id", flat=True)),
        },
    }


def check_out_assigned_intervention(
    *,
    intervention,
    final_mileage: int,
    final_vehicle_state: str,
    conclusions: str,
    vehicle_operational=None,
    vehicle_clean=None,
    new_intervention_needed: bool,
    final_comment: str = "",
    photos=None,
):
    if final_mileage < 0:
        _raise_workflow_error("INVALID_MILEAGE", "Le kilometrage final doit etre positif ou nul.")

    cleaned_state = (final_vehicle_state or "").strip()
    cleaned_conclusions = (conclusions or "").strip()
    cleaned_comment = (final_comment or "").strip()
    if not cleaned_state:
        _raise_workflow_error("FINAL_STATE_REQUIRED", "L'etat final est obligatoire.")
    if not cleaned_conclusions:
        _raise_workflow_error("CONCLUSIONS_REQUIRED", "Les conclusions sont obligatoires.")
    if vehicle_operational is False and not cleaned_comment:
        _raise_workflow_error("FINAL_COMMENT_REQUIRED", "Un commentaire est obligatoire si le vehicule n'est pas operationnel.")
    if vehicle_clean is False and not cleaned_comment:
        _raise_workflow_error("FINAL_COMMENT_REQUIRED", "Un commentaire est obligatoire si le vehicule n'est pas propre.")

    photo_files = list(photos or [])
    if not photo_files:
        _raise_workflow_error("PHOTOS_REQUIRED", "Au moins une photo finale est obligatoire.")

    with transaction.atomic():
        locked = (
            Intervention.objects.select_for_update()
            .select_related("vehicle", "vehicle__brand", "vehicle__parking_space", "vehicle__parking_space__parking", "assigned_to")
            .prefetch_related("technical_inspections__photos")
            .get(pk=intervention.pk)
        )
        if locked.status != Intervention.Status.EN_COURS:
            _raise_workflow_error("INVALID_STATUS", "L'intervention doit etre EN_COURS avant cloture.", http_status=409)
        check_in = locked.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
        if check_in is None:
            _raise_workflow_error("CHECK_IN_REQUIRED", "Le check-in est obligatoire avant le check-out.", http_status=409)
        if final_mileage < check_in.mileage:
            _raise_workflow_error("INVALID_FINAL_MILEAGE", "Le kilometrage final doit etre superieur ou egal au kilometrage initial.")

        check_out = locked.technical_inspections.filter(phase=TechnicalInspection.Phase.FINAL).order_by("id").first()
        observations = "\n".join([cleaned_state, f"Conclusions: {cleaned_conclusions}", cleaned_comment]).strip()
        if check_out is None:
            check_out = TechnicalInspection.objects.create(
                intervention=locked,
                vehicle=locked.vehicle,
                phase=TechnicalInspection.Phase.FINAL,
                mileage=final_mileage,
                energy_level_percent=0,
                observations=observations,
            )
        else:
            check_out.mileage = final_mileage
            check_out.observations = observations
            check_out.save(update_fields=["mileage", "observations"])
            check_out.photos.all().delete()
        for uploaded_file in photo_files:
            TechnicalPhoto.objects.create(technical_inspection=check_out, file=uploaded_file, caption="Apres intervention")

        work_payload = {}
        try:
            current_report = json.loads(locked.report) if locked.report else {}
            work_payload = current_report.get("work_in_progress") or {}
        except (TypeError, ValueError):
            work_payload = {}
        final_payload = {
            "final_vehicle_state": cleaned_state,
            "conclusions": cleaned_conclusions,
            "vehicle_operational": vehicle_operational,
            "vehicle_clean": vehicle_clean,
            "new_intervention_needed": new_intervention_needed,
            "final_comment": cleaned_comment,
        }
        anomaly_type = str(work_payload.get("anomaly_type") or "").strip()
        anomaly_comment = str(work_payload.get("anomaly_comment") or "").strip()
        requires_manager_validation = (
            vehicle_operational is False
            or vehicle_clean is False
            or new_intervention_needed
            or bool(anomaly_type)
            or bool(anomaly_comment)
        )
        locked.completed_at = timezone.now()
        locked.status = Intervention.Status.TERMINEE
        locked.report = json.dumps({"final_report": _final_report_payload(
            intervention=locked,
            check_in=check_in,
            check_out=check_out,
            work_data=work_payload,
            estimated_cost=locked.estimated_cost,
            final_payload=final_payload,
        )}, ensure_ascii=False)
        locked.save(update_fields=["status", "completed_at", "report", "updated_at"])
        locked.vehicle.status = Vehicle.Status.A_CONTROLER if requires_manager_validation else Vehicle.Status.DISPONIBLE
        locked.vehicle.save(update_fields=["status", "updated_at"])

        intervention.status = locked.status
        intervention.completed_at = locked.completed_at
        intervention.report = locked.report
        intervention.updated_at = locked.updated_at
        intervention.vehicle.status = locked.vehicle.status
    return intervention


def interrupt_assigned_intervention(*, intervention, reason_type: str, reason_detail: str = "", photo=None):
    cleaned_reason_type = (reason_type or "").strip()
    cleaned_reason_detail = (reason_detail or "").strip()
    if not cleaned_reason_type:
        _raise_workflow_error("INTERRUPT_REASON_REQUIRED", "Le motif d'interruption est obligatoire.")

    reason = cleaned_reason_type if not cleaned_reason_detail else f"{cleaned_reason_type}: {cleaned_reason_detail}"

    with transaction.atomic():
        locked = Intervention.objects.select_for_update().select_related("vehicle").get(pk=intervention.pk)
        if locked.status not in {Intervention.Status.ATTRIBUEE, Intervention.Status.EN_COURS}:
            _raise_workflow_error(
                "INVALID_STATUS",
                "Cette intervention ne peut plus etre interrompue.",
                http_status=409,
            )

        locked.status = Intervention.Status.ANNULEE
        locked.cancelled_at = timezone.now()
        locked.cancellation_reason = reason
        locked.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])

        if photo is not None:
            technical_inspection = locked.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
            if technical_inspection is None:
                technical_inspection = TechnicalInspection.objects.create(
                    intervention=locked,
                    vehicle=locked.vehicle,
                    phase=TechnicalInspection.Phase.INITIAL,
                    mileage=max(getattr(locked.vehicle, "mileage", 0) or 0, 0),
                    energy_level_percent=0,
                    observations=f"Interruption: {reason}",
                )
            TechnicalPhoto.objects.create(technical_inspection=technical_inspection, file=photo, caption="Photo interruption")

        intervention.status = locked.status
        intervention.cancelled_at = locked.cancelled_at
        intervention.cancellation_reason = locked.cancellation_reason
        intervention.updated_at = locked.updated_at

    return intervention
