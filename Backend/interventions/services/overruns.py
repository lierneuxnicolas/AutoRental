from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from interventions.models import Intervention
from notifications.models import Notification
from notifications.services import notify_users_with_roles
from reservations.models import Reservation


def notify_overrun_reservation_conflicts(*, intervention: Intervention) -> int:
    """Notify managers once for each reservation already affected by an active overrun."""
    with transaction.atomic():
        locked = Intervention.objects.select_for_update().select_related(
            "vehicle",
            "vehicle__brand",
        ).get(pk=intervention.pk)
        now = timezone.now()

        if (
            locked.intervention_type != Intervention.Type.MECANIQUE
            or locked.status not in {Intervention.Status.EN_COURS, Intervention.Status.EN_PAUSE}
            or locked.planned_start_at is None
            or locked.planned_end_at is None
            or now <= locked.planned_end_at
        ):
            return 0

        reservations = (
            Reservation.objects.select_related("client", "client__user")
            .filter(
                vehicle=locked.vehicle,
                status__in=[
                    Reservation.Status.EN_ATTENTE_CAUTION,
                    Reservation.Status.EN_ATTENTE_PAIEMENT,
                    Reservation.Status.CONFIRMEE,
                ],
                start_at__gte=locked.planned_end_at,
                end_at__gt=locked.planned_end_at,
            )
            .order_by("start_at", "id")
        )

        created_count = 0
        vehicle_label = f"{locked.vehicle.brand.name} {locked.vehicle.model_name} · {locked.vehicle.registration_number}"
        for reservation in reservations:
            if Notification.objects.filter(
                notification_type=Notification.NotificationType.INTERVENTION_OVERRUN,
                related_object_type="reservation",
                related_object_id=reservation.id,
            ).exists():
                continue

            client_user = reservation.client.user
            client_name = f"{client_user.first_name} {client_user.last_name}".strip() or client_user.email
            message = (
                f"L'intervention mécanique sur {vehicle_label} dépasse son créneau prévu et empiète sur la réservation "
                f"{reservation.reference} de {client_name}, du {reservation.start_at:%d/%m/%Y %H:%M} "
                f"au {reservation.end_at:%d/%m/%Y %H:%M}."
            )
            transaction.on_commit(
                lambda reservation_id=reservation.id, message=message: notify_users_with_roles(
                    role_codes=[Role.Code.GESTIONNAIRE_COMPTABLE, Role.Code.ADMINISTRATEUR],
                    notification_type=Notification.NotificationType.INTERVENTION_OVERRUN,
                    title="Intervention prolongée : réservation impactée",
                    message=message,
                    related_object_type="reservation",
                    related_object_id=reservation_id,
                )
            )
            created_count += 1

    return created_count