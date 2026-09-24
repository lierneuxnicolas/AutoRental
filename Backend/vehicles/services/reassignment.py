from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from notifications.models import Notification
from notifications.services import notify_users_with_roles
from reservations.models import Reservation
from vehicles.models import Vehicle


REASSIGNMENT_TRIGGER_STATUSES = {
    Vehicle.Status.MAINTENANCE,
    Vehicle.Status.NETTOYAGE,
    Vehicle.Status.ACCIDENTE,
    Vehicle.Status.A_CONTROLER,
    Vehicle.Status.INDISPONIBLE,
}


def update_vehicle_status_and_flag_reassignments(*, vehicle, new_status):
    with transaction.atomic():
        locked_vehicle = Vehicle.objects.select_for_update().get(pk=vehicle.pk)
        locked_vehicle.status = new_status
        locked_vehicle.save(update_fields=["status", "updated_at"])

        reservations = []
        if new_status in REASSIGNMENT_TRIGGER_STATUSES:
            reservations = list(
                Reservation.objects.select_for_update().filter(
                    vehicle=locked_vehicle,
                    status=Reservation.Status.CONFIRMEE,
                    start_at__gt=timezone.now(),
                )
            )
            if reservations:
                Reservation.objects.filter(pk__in=[reservation.pk for reservation in reservations]).update(
                    status=Reservation.Status.REAFFECTATION_REQUIRED,
                    updated_at=timezone.now(),
                )

        for reservation in reservations:
            transaction.on_commit(
                lambda reservation=reservation: notify_users_with_roles(
                    role_codes={Role.Code.GESTIONNAIRE_COMPTABLE, Role.Code.ADMINISTRATEUR},
                    notification_type=Notification.NotificationType.RESERVATION_REASSIGNMENT_REQUIRED,
                    title="Réaffectation nécessaire",
                    message=(
                        f"Le véhicule de la réservation {reservation.reference} est indisponible. "
                        "Une réaffectation est nécessaire."
                    ),
                    related_object_type="reservation",
                    related_object_id=reservation.pk,
                )
            )

    return locked_vehicle