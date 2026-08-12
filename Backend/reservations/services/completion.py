from dataclasses import dataclass

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from interventions.models import Intervention
from inspections.models import Inspection
from notifications.services import create_notification
from reservations.models import Reservation
from vehicles.models import Vehicle


RESERVATION_COMPLETED_NOTIFICATION_TYPE = "RESERVATION_COMPLETED"


@dataclass(frozen=True)
class ReservationCompletionError(ValueError):
    code: str
    message: str
    http_status: int = 400

    def __str__(self) -> str:
        return self.message


def _raise_completion_error(code: str, message: str, *, http_status: int = 400) -> None:
    raise ReservationCompletionError(code=code, message=message, http_status=http_status)


def _format_local_datetime(value) -> str:
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def _build_frontend_invoices_url() -> str | None:
    frontend_url = (getattr(settings, "FRONTEND_URL", "") or "").strip()
    if not frontend_url:
        return None
    if not (frontend_url.startswith("http://") or frontend_url.startswith("https://")):
        return None
    return f"{frontend_url.rstrip('/')}/invoices"


def _reservation_has_invoice(*, reservation: Reservation) -> bool:
    return Reservation.objects.filter(pk=reservation.pk, invoice__isnull=False).exists()


def _notify_reservation_completed_once(*, reservation: Reservation):
    user = reservation.client.user
    existing = user.notifications.filter(
        notification_type=RESERVATION_COMPLETED_NOTIFICATION_TYPE,
        related_object_type="reservation",
        related_object_id=reservation.id,
    ).exists()
    if existing:
        return None

    return create_notification(
        user=user,
        notification_type=RESERVATION_COMPLETED_NOTIFICATION_TYPE,
        title="Réservation terminée",
        message=f"Votre réservation {reservation.reference} est terminée.",
        related_object_type="reservation",
        related_object_id=reservation.id,
    )


def _send_reservation_completed_email(*, reservation: Reservation) -> None:
    client_user = reservation.client.user
    first_name = (getattr(client_user, "first_name", "") or "").strip()
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"

    vehicle_brand = (getattr(getattr(reservation.vehicle, "brand", None), "name", "") or "").strip()
    vehicle_model = (getattr(reservation.vehicle, "model_name", "") or "").strip()
    vehicle_label = " ".join(part for part in [vehicle_brand, vehicle_model] if part)

    invoice_line = ""
    if _reservation_has_invoice(reservation=reservation):
        invoices_url = _build_frontend_invoices_url()
        if invoices_url:
            invoice_line = f"\nConsulter mes factures : {invoices_url}\n"

    send_mail(
        subject="Merci d’avoir choisi GetACar",
        message=(
            f"{greeting}\n\n"
            "Votre réservation GetACar est maintenant terminée.\n\n"
            f"Référence : {reservation.reference}\n"
            f"Véhicule : {vehicle_label}\n"
            f"Début : {_format_local_datetime(reservation.start_at)}\n"
            f"Fin : {_format_local_datetime(reservation.end_at)}\n\n"
            "Merci d’avoir choisi GetACar pour votre location.\n\n"
            "Vous pouvez retrouver vos réservations et vos factures dans votre espace client.\n"
            f"{invoice_line}\n"
            "À bientôt,\n"
            "GetACar"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[client_user.email],
        fail_silently=False,
    )


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

        def _notify_and_send_completed_email_once() -> None:
            notification = _notify_reservation_completed_once(reservation=locked)
            if notification is None:
                return
            _send_reservation_completed_email(reservation=locked)

        transaction.on_commit(_notify_and_send_completed_email_once)

    return locked