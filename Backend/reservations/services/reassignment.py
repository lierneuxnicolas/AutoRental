from django.db import transaction
from django.db.models import Case, IntegerField, Value, When
from django.utils import timezone

from common.models import SystemLog
from notifications.models import Notification
from notifications.services import create_notification
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import get_available_vehicles, is_vehicle_available


class ReservationReassignmentError(ValueError):
    def __init__(self, code, message, *, http_status=409):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


def _ensure_reassignment_required(reservation):
    if reservation.status != Reservation.Status.REAFFECTATION_REQUIRED:
        raise ReservationReassignmentError(
            "INVALID_STATUS",
            "La réservation n'est pas en attente de réaffectation.",
        )


def get_replacement_vehicles(*, reservation):
    _ensure_reassignment_required(reservation)
    return get_available_vehicles(
        start=reservation.start_at,
        end=reservation.end_at,
        base_queryset=Vehicle.objects.select_related(
            "brand",
            "category",
            "parking_space",
            "parking_space__parking",
        ).prefetch_related("photos").exclude(pk=reservation.vehicle_id),
    ).annotate(
        _category_priority=Case(
            When(category_id=reservation.vehicle.category_id, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by("_category_priority", "category__name", "brand__name", "model_name", "registration_number")


def reassign_reservation(*, reservation_id, new_vehicle_id, actor=None):
    with transaction.atomic():
        reservation = Reservation.objects.select_for_update().select_related(
            "client__user",
            "vehicle__brand",
            "vehicle__category",
        ).get(pk=reservation_id)
        _ensure_reassignment_required(reservation)

        if reservation.vehicle_id == new_vehicle_id:
            raise ReservationReassignmentError("SAME_VEHICLE", "Le véhicule de remplacement doit être différent.")

        try:
            new_vehicle = Vehicle.objects.select_for_update().select_related("brand", "category").get(pk=new_vehicle_id)
        except Vehicle.DoesNotExist as error:
            raise ReservationReassignmentError("VEHICLE_NOT_FOUND", "Le véhicule de remplacement est introuvable.", http_status=404) from error

        if not is_vehicle_available(vehicle=new_vehicle, start=reservation.start_at, end=reservation.end_at):
            raise ReservationReassignmentError(
                "VEHICLE_UNAVAILABLE",
                "Ce véhicule n'est plus disponible pour toute la période de réservation.",
            )

        previous_vehicle = reservation.vehicle
        reservation.vehicle = new_vehicle
        reservation.status = Reservation.Status.CONFIRMEE
        reservation.save(update_fields=["vehicle", "status", "updated_at"])

        SystemLog.objects.create(
            user=actor,
            action="RESERVATION_REASSIGNED",
            message=(
                f"Réservation {reservation.reference} réaffectée du véhicule "
                f"{previous_vehicle.registration_number} au véhicule {new_vehicle.registration_number}."
            ),
        )

        transaction.on_commit(
            lambda: create_notification(
                user=reservation.client.user,
                notification_type=Notification.NotificationType.RESERVATION_REASSIGNED,
                title="Véhicule remplacé",
                message=(
                    f"Votre véhicule a été remplacé pour votre réservation {reservation.reference}. "
                    f"Nouveau véhicule : {new_vehicle.brand.name} {new_vehicle.model_name}. "
                    f"Du {timezone.localtime(reservation.start_at):%d/%m/%Y %H:%M} "
                    f"au {timezone.localtime(reservation.end_at):%d/%m/%Y %H:%M}."
                ),
                related_object_type="reservation",
                related_object_id=reservation.pk,
            )
        )

    return reservation