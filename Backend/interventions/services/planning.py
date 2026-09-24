from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import transaction

from interventions.models import Intervention
from interventions.services.assignment import InterventionAssignmentError, assign_intervention
from interventions.services.creation import InterventionCreationError, create_intervention
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import get_blocking_reservation_statuses


@dataclass(frozen=True)
class InterventionPlanningError(ValueError):
    code: str
    message: str
    conflict_reservation: Reservation | None = None
    conflict_intervention: Intervention | None = None

    def __str__(self):
        return self.message


def plan_intervention(
    *,
    vehicle_id,
    intervention_type,
    assigned_user_id,
    planned_start_at,
    planned_end_at,
    description,
    manager,
):
    if planned_end_at <= planned_start_at:
        raise InterventionPlanningError("INVALID_PERIOD", "La fin prévue doit être postérieure au début prévu.")

    with transaction.atomic():
        try:
            vehicle = Vehicle.objects.select_for_update().get(pk=vehicle_id)
        except Vehicle.DoesNotExist as error:
            raise InterventionPlanningError("VEHICLE_NOT_FOUND", "Le véhicule est introuvable.") from error

        conflict = (
            Reservation.objects.select_for_update()
            .select_related("client__user", "vehicle")
            .filter(
                vehicle=vehicle,
                status__in=get_blocking_reservation_statuses(),
                start_at__lt=planned_end_at,
                end_at__gt=planned_start_at,
            )
            .order_by("start_at", "id")
            .first()
        )
        if conflict is not None:
            raise InterventionPlanningError(
                "RESERVATION_CONFLICT",
                "Ce véhicule possède une réservation pendant cette période.",
                conflict_reservation=conflict,
            )

        intervention_conflict = (
            Intervention.objects.select_for_update()
            .filter(
                vehicle=vehicle,
                status__in=(Intervention.Status.A_ATTRIBUER, Intervention.Status.ATTRIBUEE, Intervention.Status.PLANIFIEE, Intervention.Status.EN_COURS, Intervention.Status.EN_PAUSE),
                planned_start_at__lt=planned_end_at,
                planned_end_at__gt=planned_start_at,
            )
            .order_by("planned_start_at", "id")
            .first()
        )
        if intervention_conflict is not None:
            raise InterventionPlanningError(
                "INTERVENTION_CONFLICT",
                "Ce créneau entre en conflit avec une intervention planifiée.",
                conflict_intervention=intervention_conflict,
            )

        try:
            intervention = create_intervention(
                vehicle_id=vehicle.id,
                reservation_id=None,
                intervention_type=intervention_type,
                description=description,
                created_by=manager,
            )
            intervention.planned_start_at = planned_start_at
            intervention.planned_end_at = planned_end_at
            intervention.save(update_fields=["planned_start_at", "planned_end_at", "updated_at"])
            intervention = assign_intervention(
                intervention=intervention,
                assigned_user_id=assigned_user_id,
                manager=manager,
            )
            intervention.status = Intervention.Status.PLANIFIEE
            intervention.save(update_fields=["status", "updated_at"])
        except (InterventionCreationError, InterventionAssignmentError, ValidationError) as error:
            if isinstance(error, ValidationError):
                message = "; ".join(
                    str(item)
                    for values in error.message_dict.values()
                    for item in (values if isinstance(values, list) else [values])
                ) or "Les données de planification sont invalides."
                raise InterventionPlanningError("INVALID_PLANNING", message) from error
            raise InterventionPlanningError(error.code, error.message) from error

    return intervention