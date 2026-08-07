from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from interventions.models import Intervention
from inspections.models import Inspection
from reservations.models import Reservation
from vehicles.models import Vehicle


@dataclass(frozen=True)
class ReservationCompletionError(ValueError):
    code: str
    message: str
    http_status: int = 400

    def __str__(self) -> str:
        return self.message


def _raise_completion_error(code: str, message: str, *, http_status: int = 400) -> None:
    raise ReservationCompletionError(code=code, message=message, http_status=http_status)


def _has_completed_final_inspection(*, reservation: Reservation) -> bool:
    return reservation.inspections.filter(
        inspection_type=Inspection.Type.FINAL,
        status=Inspection.Status.TERMINE,
    ).exists()


def _has_pending_or_active_intervention(*, reservation: Reservation) -> bool:
    return reservation.interventions.exclude(status=Intervention.Status.TERMINEE).exists()


def complete_reservation(*, reservation: Reservation, requested_by) -> Reservation:
    with transaction.atomic():
        locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )
        vehicle_locked = Vehicle.objects.select_for_update().get(pk=locked.vehicle_id)

        if locked.status == Reservation.Status.TERMINEE:
            return locked

        if locked.status != Reservation.Status.A_CONTROLER:
            _raise_completion_error(
                "INVALID_STATUS",
                "La reservation doit etre A_CONTROLER pour etre terminee.",
            )

        role_code = getattr(getattr(requested_by, "role", None), "code", None)
        if not getattr(requested_by, "is_superuser", False) and role_code not in {"GESTIONNAIRE_COMPTABLE", "ADMINISTRATEUR"}:
            _raise_completion_error(
                "FORBIDDEN",
                "Cette action est reservee aux gestionnaires-comptables ou aux administrateurs.",
                http_status=403,
            )

        if vehicle_locked.status != Vehicle.Status.DISPONIBLE:
            _raise_completion_error(
                "VEHICLE_NOT_AVAILABLE",
                "Le vehicule doit etre DISPONIBLE avant de cloturer la reservation.",
                http_status=409,
            )

        if not _has_completed_final_inspection(reservation=locked):
            _raise_completion_error(
                "FINAL_INSPECTION_REQUIRED",
                "Une inspection finale terminee est requise avant la cloture.",
                http_status=409,
            )

        if _has_pending_or_active_intervention(reservation=locked):
            _raise_completion_error(
                "INTERVENTIONS_NOT_COMPLETED",
                "Toutes les interventions doivent etre terminees avant la cloture.",
                http_status=409,
            )

        locked.status = Reservation.Status.TERMINEE
        locked.save(update_fields=["status", "updated_at"])

    return locked