"""Manager decision workflow for a reservation flagged 'A verifier' (check-in anomaly review).

Reuses existing services on purpose:
- vehicles.services.reassignment.update_vehicle_status_and_flag_reassignments for vehicle status changes
- interventions.services.creation.create_intervention for opening the maintenance workflow

No Damage/Inspection/photo record is ever modified or deleted here: the review
resolution is tracked separately on Reservation.review_resolved_at so the
historical anomaly data stays intact.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from interventions.models import Intervention
from interventions.services.creation import InterventionCreationError, create_intervention
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services.reassignment import update_vehicle_status_and_flag_reassignments


class ReservationReviewDecision:
    PARK = "PARK"
    MAINTENANCE = "MAINTENANCE"
    UNAVAILABLE = "UNAVAILABLE"

    CHOICES = (PARK, MAINTENANCE, UNAVAILABLE)


@dataclass(frozen=True)
class ReservationReviewError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _raise_review_error(code: str, message: str) -> None:
    raise ReservationReviewError(code=code, message=message)


def resolve_reservation_review(*, reservation: Reservation, requested_by, decision: str):
    """Apply a manager decision for a reservation flagged 'A verifier' and clear that flag.

    Returns a tuple (reservation, vehicle, intervention_or_none).
    """

    if decision not in ReservationReviewDecision.CHOICES:
        _raise_review_error("INVALID_DECISION", "La decision demandee est invalide.")

    with transaction.atomic():
        locked_reservation = Reservation.objects.select_for_update().select_related("vehicle").get(pk=reservation.pk)
        vehicle = Vehicle.objects.select_for_update().get(pk=locked_reservation.vehicle_id)

        intervention = None
        if decision == ReservationReviewDecision.PARK:
            vehicle = update_vehicle_status_and_flag_reassignments(vehicle=vehicle, new_status=Vehicle.Status.DISPONIBLE)
        elif decision == ReservationReviewDecision.UNAVAILABLE:
            vehicle = update_vehicle_status_and_flag_reassignments(vehicle=vehicle, new_status=Vehicle.Status.INDISPONIBLE)
        else:
            vehicle = update_vehicle_status_and_flag_reassignments(vehicle=vehicle, new_status=Vehicle.Status.MAINTENANCE)
            try:
                intervention = create_intervention(
                    vehicle_id=vehicle.id,
                    reservation_id=locked_reservation.id,
                    intervention_type=Intervention.Type.MECANIQUE,
                    description=(
                        "Maintenance requise suite a une anomalie signalee au check-in de la reservation "
                        f"{locked_reservation.reference}."
                    ),
                    created_by=requested_by,
                )
            except InterventionCreationError as exc:
                _raise_review_error(exc.code, exc.message)

        vehicle.needs_supervision = False
        vehicle.has_urgent_checkin_anomaly = False
        vehicle.save(update_fields=["needs_supervision", "has_urgent_checkin_anomaly", "updated_at"])

        locked_reservation.review_resolved_at = timezone.now()
        locked_reservation.save(update_fields=["review_resolved_at", "updated_at"])

    return locked_reservation, vehicle, intervention
