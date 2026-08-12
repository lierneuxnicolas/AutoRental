from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from notifications.services import create_notification
from reservations.models import Reservation

REMINDER_NOTIFICATION_TYPE = "RESERVATION_REMINDER_24H"


def _format_local_datetime(value) -> str:
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def _reminder_already_sent(*, user, reservation_id: int) -> bool:
    return user.notifications.filter(
        notification_type=REMINDER_NOTIFICATION_TYPE,
        related_object_type="reservation",
        related_object_id=reservation_id,
    ).exists()


def _build_location_label(reservation: Reservation) -> str:
    parking_space = getattr(reservation.vehicle, "parking_space", None)
    parking = getattr(parking_space, "parking", None)
    if parking is None:
        return "Non renseigné"

    parking_name = (getattr(parking, "name", "") or "").strip()
    parking_address = (getattr(parking, "address", "") or "").strip()

    if parking_name and parking_address:
        return f"{parking_name}, {parking_address}"
    if parking_name:
        return parking_name
    if parking_address:
        return parking_address
    return "Non renseigné"


def _send_reservation_reminder_email(*, reservation: Reservation) -> None:
    user = reservation.client.user
    first_name = (getattr(user, "first_name", "") or "").strip()
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"

    vehicle_brand = (getattr(reservation.vehicle.brand, "name", "") or "").strip()
    vehicle_model = (getattr(reservation.vehicle, "model_name", "") or "").strip()
    vehicle_label = " ".join(part for part in [vehicle_brand, vehicle_model] if part)

    send_mail(
        subject="Rappel de votre réservation GetACar",
        message=(
            f"{greeting}\n\n"
            "Petit rappel : votre réservation GetACar commence bientôt.\n\n"
            f"Référence : {reservation.reference}\n"
            f"Véhicule : {vehicle_label}\n"
            f"Début : {_format_local_datetime(reservation.start_at)}\n"
            f"Lieu : {_build_location_label(reservation)}\n\n"
            "Pensez à vérifier que votre profil et vos documents sont en ordre avant votre départ.\n\n"
            "À bientôt,\n"
            "GetACar"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_reservation_24h_reminders(*, reference_time=None, lookahead_hours: int = 24, window_minutes: int = 60) -> int:
    now = reference_time or timezone.now()
    window_start = now + timedelta(hours=lookahead_hours)
    window_end = window_start + timedelta(minutes=window_minutes)

    candidate_ids = list(
        Reservation.objects.filter(
            status=Reservation.Status.CONFIRMEE,
            cancelled_at__isnull=True,
            start_at__gte=window_start,
            start_at__lt=window_end,
        ).values_list("id", flat=True)
    )

    sent_count = 0

    for reservation_id in candidate_ids:
        with transaction.atomic():
            reservation = (
                Reservation.objects.select_for_update()
                .select_related(
                    "client",
                    "client__user",
                    "vehicle",
                    "vehicle__brand",
                    "vehicle__parking_space",
                    "vehicle__parking_space__parking",
                )
                .filter(pk=reservation_id)
                .first()
            )

            if reservation is None:
                continue

            if reservation.status != Reservation.Status.CONFIRMEE:
                continue

            if reservation.cancelled_at is not None:
                continue

            if reservation.start_at < window_start or reservation.start_at >= window_end:
                continue

            user = reservation.client.user
            if _reminder_already_sent(user=user, reservation_id=reservation.id):
                continue

            _send_reservation_reminder_email(reservation=reservation)
            create_notification(
                user=user,
                notification_type=REMINDER_NOTIFICATION_TYPE,
                title="Rappel de réservation envoyé",
                message=(
                    f"Rappel 24h envoyé pour la réservation {reservation.reference}."
                ),
                related_object_type="reservation",
                related_object_id=reservation.id,
            )
            sent_count += 1

    return sent_count
