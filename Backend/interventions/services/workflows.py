from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from interventions.models import Intervention, TechnicalInspection, TechnicalPhoto


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
        locked = Intervention.objects.select_for_update().get(pk=intervention.pk)

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

        if locked.status == Intervention.Status.ATTRIBUEE:
            locked.status = Intervention.Status.EN_COURS
            if locked.started_at is None:
                locked.started_at = timezone.now()
            locked.save(update_fields=["status", "started_at", "updated_at"])

        intervention.status = locked.status
        intervention.started_at = locked.started_at

    return intervention


def _get_or_create_technical_inspection(*, intervention):
    technical_inspection = intervention.technical_inspections.order_by("id").first()
    if technical_inspection is not None:
        return technical_inspection

    fallback_mileage = max(getattr(intervention.vehicle, "mileage", 0) or 0, 0)
    return TechnicalInspection.objects.create(
        intervention=intervention,
        vehicle=intervention.vehicle,
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
