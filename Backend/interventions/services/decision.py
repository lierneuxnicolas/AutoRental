from dataclasses import dataclass
from django.db import transaction
from django.utils import timezone
from interventions.models import Intervention
from vehicles.models import Vehicle
from interventions.services.planning import plan_intervention

@dataclass(frozen=True)
class InterventionDecisionError(ValueError):
    code: str
    message: str

def decide_intervention(*, intervention_id, decision, manager, comment="", planning=None):
    with transaction.atomic():
        intervention = Intervention.objects.select_for_update().select_related("vehicle").get(pk=intervention_id)
        if intervention.status != Intervention.Status.TERMINEE:
            raise InterventionDecisionError("INVALID_STATUS", "Seule une intervention terminée peut être décidée.")
        if intervention.decision:
            raise InterventionDecisionError("ALREADY_DECIDED", "La décision de cette intervention a déjà été prise.")
        if decision not in {choice for choice, _ in Intervention.Decision.choices}:
            raise InterventionDecisionError("INVALID_DECISION", "Décision inconnue.")
        if decision == Intervention.Decision.RETURN_TO_PARK:
            intervention.vehicle.status = Vehicle.Status.DISPONIBLE
            intervention.vehicle.save(update_fields=["status", "updated_at"])
        elif decision == Intervention.Decision.MARK_UNAVAILABLE:
            intervention.vehicle.status = Vehicle.Status.INDISPONIBLE
            intervention.vehicle.save(update_fields=["status", "updated_at"])
        elif planning is None:
            raise InterventionDecisionError("PLANNING_REQUIRED", "Les informations de planification sont obligatoires.")
        elif decision in {Intervention.Decision.PLAN_MAINTENANCE, Intervention.Decision.PLAN_CLEANING}:
            plan_intervention(
                vehicle_id=intervention.vehicle_id,
                intervention_type="MECANIQUE" if decision == Intervention.Decision.PLAN_MAINTENANCE else "NETTOYAGE",
                assigned_user_id=planning["assigned_user_id"],
                planned_start_at=planning["planned_start_at"],
                planned_end_at=planning["planned_end_at"],
                description=planning["description"],
                manager=manager,
            )
        intervention.decision = decision
        intervention.decided_at = timezone.now()
        intervention.decided_by = manager
        intervention.decision_comment = (comment or "").strip()
        intervention.save(update_fields=["decision", "decided_at", "decided_by", "decision_comment", "updated_at"])
    return intervention