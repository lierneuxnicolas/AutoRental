import os
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import send_mail
from django.db import models
from django.db import transaction
from django.utils import timezone

from common.models import SystemLog
from common.services import create_system_log
from inspections.models import InspectionPhoto
from inspections.serializers import InspectionPhotoCreateSerializer
from invoicing.services import InvoiceCreationNotAvailable, create_invoice_for_reservation
from interventions.services import create_intervention
from interventions.models import Intervention
from inspections.models import Inspection
from notifications.services import create_notification
from payments.models import Deposit
from reservations.models import Reservation
from vehicles.models import Vehicle


RESERVATION_COMPLETED_NOTIFICATION_TYPE = "RESERVATION_COMPLETED"
RETURN_ISSUE_REPORTED_NOTIFICATION_TYPE = "RETURN_ISSUE_REPORTED"


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
        title="Retour valide",
        message="Votre retour a été validé. La caution a été libérée.",
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


def _get_completed_final_inspection(*, reservation: Reservation) -> Inspection:
    inspection = (
        reservation.inspections.filter(
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.TERMINE,
        )
        .order_by("-completed_at", "-created_at", "-id")
        .first()
    )
    if inspection is None:
        _raise_completion_error(
            "FINAL_INSPECTION_REQUIRED",
            "Une inspection finale terminee est requise avant cette action.",
            http_status=409,
        )
    return inspection


def _get_latest_deposit_for_return_validation(*, reservation: Reservation) -> Deposit:
    deposit = (
        Deposit.objects.select_for_update()
        .filter(reservation=reservation)
        .order_by("-authorized_at", "-created_at", "-id")
        .first()
    )
    if deposit is None:
        _raise_completion_error(
            "DEPOSIT_NOT_FOUND",
            "Aucune caution n'est disponible pour cette reservation.",
            http_status=409,
        )

    if deposit.status not in {Deposit.Status.A_VERIFIER, Deposit.Status.LIBEREE}:
        _raise_completion_error(
            "DEPOSIT_STATUS_INVALID",
            "La caution doit etre A_VERIFIER ou deja LIBEREE avant validation du retour.",
            http_status=409,
        )

    return deposit


def _resolve_vehicle_status_after_return_validation(*, reservation: Reservation, vehicle: Vehicle) -> str:
    blocking_intervention_types = set(
        reservation.interventions.exclude(status__in=[Intervention.Status.TERMINEE, Intervention.Status.ANNULEE])
        .values_list("intervention_type", flat=True)
    )

    if Intervention.Type.MECANIQUE in blocking_intervention_types:
        return Vehicle.Status.MAINTENANCE

    if Intervention.Type.NETTOYAGE in blocking_intervention_types:
        return Vehicle.Status.NETTOYAGE

    if vehicle.status in {
        Vehicle.Status.MAINTENANCE,
        Vehicle.Status.NETTOYAGE,
        Vehicle.Status.ACCIDENTE,
        Vehicle.Status.INDISPONIBLE,
    }:
        return vehicle.status

    return Vehicle.Status.DISPONIBLE


def _build_issue_intervention_type(*, anomaly_type: str, vehicle_status: str) -> str:
    if anomaly_type == "NETTOYAGE" or vehicle_status == Vehicle.Status.NETTOYAGE:
        return Intervention.Type.NETTOYAGE
    return Intervention.Type.MECANIQUE


def _build_issue_description(*, anomaly_type: str, comment: str, vehicle_status: str) -> str:
    lines = [
        f"Type d'anomalie: {anomaly_type}",
        f"Orientation vehicule: {vehicle_status}",
    ]
    cleaned_comment = (comment or "").strip()
    if cleaned_comment:
        lines.append(f"Commentaire gestionnaire: {cleaned_comment}")
    return "\n".join(lines)


def _attach_issue_evidence_to_final_inspection(*, inspection: Inspection, evidence_files, anomaly_type: str) -> list[InspectionPhoto]:
    validator = InspectionPhotoCreateSerializer()
    created_photos: list[InspectionPhoto] = []
    normalized_type = InspectionPhoto.PhotoType.DOMMAGE if anomaly_type == "ACCIDENT" else InspectionPhoto.PhotoType.AUTRE
    next_position = inspection.photos.filter(photo_type=normalized_type).aggregate(max_position=models.Max("position")).get("max_position")
    next_position = 0 if next_position is None else next_position + 1

    for uploaded_file in evidence_files or []:
        validator.validate_file(uploaded_file)
        _, ext = os.path.splitext(uploaded_file.name or "")
        uploaded_file.name = f"{uuid.uuid4().hex}{(ext or '.jpg').lower()}"
        photo = InspectionPhoto.objects.create(
            inspection=inspection,
            photo_type=normalized_type,
            file=uploaded_file,
            position=next_position,
        )
        created_photos.append(photo)
        next_position += 1

    return created_photos


def _notify_return_issue_once(*, reservation: Reservation, intervention: Intervention):
    user = reservation.client.user
    existing = user.notifications.filter(
        notification_type=RETURN_ISSUE_REPORTED_NOTIFICATION_TYPE,
        related_object_type="intervention",
        related_object_id=intervention.id,
    ).exists()
    if existing:
        return None

    return create_notification(
        user=user,
        notification_type=RETURN_ISSUE_REPORTED_NOTIFICATION_TYPE,
        title="Retour en analyse",
        message="Votre retour fait l'objet d'une verification complementaire suite a une anomalie constatee.",
        related_object_type="intervention",
        related_object_id=intervention.id,
    )


def report_return_issue(
    *,
    reservation: Reservation,
    requested_by,
    anomaly_type: str,
    comment: str = "",
    vehicle_status: str,
    evidence_files=None,
) -> tuple[Reservation, Intervention]:
    with transaction.atomic():
        locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .get(pk=reservation.pk)
        )
        vehicle_locked = Vehicle.objects.select_for_update().get(pk=locked.vehicle_id)

        if locked.status != Reservation.Status.A_CONTROLER:
            _raise_completion_error(
                "INVALID_STATUS",
                "La reservation doit etre A_CONTROLER pour signaler une anomalie.",
            )

        role_code = getattr(getattr(requested_by, "role", None), "code", None)
        if not getattr(requested_by, "is_superuser", False) and role_code not in {"GESTIONNAIRE_COMPTABLE", "ADMINISTRATEUR"}:
            _raise_completion_error(
                "FORBIDDEN",
                "Cette action est reservee aux gestionnaires-comptables ou aux administrateurs.",
                http_status=403,
            )

        deposit = _get_latest_deposit_for_return_validation(reservation=locked)
        if deposit.status != Deposit.Status.A_VERIFIER:
            _raise_completion_error(
                "DEPOSIT_STATUS_INVALID",
                "La caution doit rester A_VERIFIER pour signaler une anomalie.",
                http_status=409,
            )

        final_inspection = _get_completed_final_inspection(reservation=locked)
        intervention = create_intervention(
            vehicle_id=vehicle_locked.id,
            reservation_id=locked.id,
            intervention_type=_build_issue_intervention_type(anomaly_type=anomaly_type, vehicle_status=vehicle_status),
            description=_build_issue_description(
                anomaly_type=anomaly_type,
                comment=comment,
                vehicle_status=vehicle_status,
            ),
            created_by=requested_by,
        )
        intervention.inspection = final_inspection
        intervention.save(update_fields=["inspection", "updated_at"])

        _attach_issue_evidence_to_final_inspection(
            inspection=final_inspection,
            evidence_files=evidence_files,
            anomaly_type=anomaly_type,
        )

        vehicle_locked.status = vehicle_status
        vehicle_locked.save(update_fields=["status", "updated_at"])

        create_system_log(
            user=requested_by,
            action="RETURN_ISSUE_REPORTED",
            message=(
                f"Reservation {locked.reference} (id={locked.id}) marked with anomaly {anomaly_type}. "
                f"Vehicle status set to {vehicle_locked.status}. Intervention {intervention.reference} created."
            ),
            level=SystemLog.Level.WARNING,
        )

        transaction.on_commit(lambda: _notify_return_issue_once(reservation=locked, intervention=intervention))

    return locked, intervention


def complete_reservation(*, reservation: Reservation, requested_by) -> Reservation:
    from payments.services.deposits import DepositReleaseError, release_authorized_deposit

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

        if not _has_completed_final_inspection(reservation=locked):
            _raise_completion_error(
                "FINAL_INSPECTION_REQUIRED",
                "Une inspection finale terminee est requise avant la cloture.",
                http_status=409,
            )

        try:
            create_invoice_for_reservation(locked)
        except InvoiceCreationNotAvailable as exc:
            _raise_completion_error(
                "INVOICE_CREATION_FAILED",
                str(exc),
                http_status=409,
            )

        deposit = _get_latest_deposit_for_return_validation(reservation=locked)

        if deposit.status == Deposit.Status.A_VERIFIER:
            try:
                released_deposit = release_authorized_deposit(reservation=locked)
            except DepositReleaseError as exc:
                _raise_completion_error(
                    "DEPOSIT_RELEASE_FAILED",
                    exc.message,
                    http_status=409,
                )

            if released_deposit is None:
                _raise_completion_error(
                    "DEPOSIT_RELEASE_FAILED",
                    "La caution n'a pas pu etre liberee.",
                    http_status=409,
                )
            deposit = released_deposit

        vehicle_status = _resolve_vehicle_status_after_return_validation(
            reservation=locked,
            vehicle=vehicle_locked,
        )

        locked.status = Reservation.Status.TERMINEE
        locked.save(update_fields=["status", "updated_at"])

        vehicle_locked.status = vehicle_status
        vehicle_locked.save(update_fields=["status", "updated_at"])

        create_system_log(
            user=requested_by,
            action="RETURN_VALIDATED",
            message=(
                f"Reservation {locked.reference} (id={locked.id}) validated after return control. "
                f"Deposit status={deposit.status}. Vehicle status={vehicle_locked.status}."
            ),
            level=SystemLog.Level.INFO,
        )

        def _notify_and_send_completed_email_once() -> None:
            notification = _notify_reservation_completed_once(reservation=locked)
            if notification is None:
                return
            _send_reservation_completed_email(reservation=locked)

        transaction.on_commit(_notify_and_send_completed_email_once)

    return locked