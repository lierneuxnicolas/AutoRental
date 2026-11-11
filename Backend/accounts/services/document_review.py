from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile, DocumentVerificationChange, Role
from accounts.validators import validate_person_name
from rest_framework.exceptions import ValidationError as SerializerValidationError
from accounts.services.profile_status import recalculate_profile_status
from notifications.services import create_notification


def _is_manager(user):
    role = getattr(user, "role", None)
    return (
        bool(user)
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
        and role is not None
        and getattr(role, "is_active", False)
        and role.code == Role.Code.GESTIONNAIRE_COMPTABLE
    )


def _notify_once(*, user, notification_type, title, message, related_object_type, related_object_id):
    existing = user.notifications.filter(
        notification_type=notification_type,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    ).exists()
    if existing:
        return None

    return create_notification(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def _send_validated_document_email(*, document) -> None:
    client_user = document.client.user
    first_name = (getattr(client_user, "first_name", "") or "").strip()
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"

    send_mail(
        subject="Votre document GetACar a été validé",
        message=(
            f"{greeting}\n\n"
            "Votre document a été validé par notre équipe.\n\n"
            f"Document : {document.get_document_type_display()}\n"
            "Statut : Validé\n\n"
            "Votre profil GetACar a été mis à jour.\n\n"
            "Merci,\n"
            "GetACar"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[client_user.email],
        fail_silently=False,
    )


def _send_rejected_document_email(*, document) -> None:
    client_user = document.client.user
    first_name = (getattr(client_user, "first_name", "") or "").strip()
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"

    send_mail(
        subject="Votre document GetACar doit être corrigé",
        message=(
            f"{greeting}\n\n"
            "Votre document n'a pas pu être validé.\n\n"
            f"Document : {document.get_document_type_display()}\n"
            "Statut : Refusé\n"
            f"Motif : {document.rejection_reason}\n\n"
            "Merci de corriger ou remplacer ce document depuis votre profil GetACar.\n\n"
            "Merci,\n"
            "GetACar"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[client_user.email],
        fail_silently=False,
    )


def validate_document(
    *,
    document,
    manager,
    driving_license_transmission=None,
    verified_date_of_birth=None,
    first_name=None,
    last_name=None,
    document_number=None,
    expiration_date=None,
):
    if not _is_manager(manager):
        raise ValueError("Seul un gestionnaire-comptable peut valider ce document.")

    with transaction.atomic():
        profile = ClientProfile.objects.select_for_update().select_related("user").get(pk=document.client_id)
        locked_document = (
            ClientDocument.objects.select_for_update()
            .select_related("client", "client__user", "validated_by")
            .get(pk=document.pk)
        )

        if not locked_document.is_active:
            raise ValueError("Ce document est inactif et ne peut pas etre valide.")
        if locked_document.status not in {ClientDocument.Status.EN_ATTENTE, ClientDocument.Status.VALIDE}:
            raise ValueError("Ce document ne peut pas être validé. Le client doit soumettre un nouveau document.")

        is_license = locked_document.document_type == ClientDocument.DocumentType.PERMIS_CONDUIRE
        is_identity = locked_document.document_type == ClientDocument.DocumentType.CARTE_IDENTITE
        is_metadata_reverification = locked_document.status == ClientDocument.Status.VALIDE

        today = timezone.localdate()
        if not document_number or not document_number.strip():
            raise ValueError("Le numéro officiel du document est obligatoire.")
        if expiration_date is None or expiration_date <= today:
            raise ValueError("La date d'expiration du document doit etre strictement future.")

        changes = {}

        def set_value(obj, field, value):
            previous = getattr(obj, field)
            if previous != value:
                def serialize(item):
                    return item.isoformat() if hasattr(item, "isoformat") else item
                changes[field] = {"before": serialize(previous), "after": serialize(value)}
                setattr(obj, field, value)

        set_value(locked_document, "document_number", document_number.strip())
        set_value(locked_document, "expiration_date", expiration_date)
        if is_identity:
            if not verified_date_of_birth:
                raise ValueError("La date de naissance vérifiée sur la carte d'identité est obligatoire.")
            try:
                ClientProfile.validate_date_of_birth_value(verified_date_of_birth)
                first_name = validate_person_name(first_name or "", label="prénom")
                last_name = validate_person_name(last_name or "", label="nom")
            except (ValidationError, SerializerValidationError) as exc:
                raise ValueError(str(exc)) from exc
            set_value(profile.user, "first_name", first_name)
            set_value(profile.user, "last_name", last_name)
            set_value(profile, "date_of_birth", verified_date_of_birth)
            set_value(locked_document, "verified_date_of_birth", verified_date_of_birth)

        if is_license:
            transmission = driving_license_transmission
            if not transmission:
                raise ValueError(
                    "La restriction de transmission du permis doit etre renseignee avant validation."
                )
            if transmission not in ClientDocument.DrivingLicenseTransmission.values:
                raise ValueError("La restriction de transmission du permis n'est pas reconnue.")
            set_value(locked_document, "driving_license_category", ClientDocument.DrivingLicenseCategory.B)
            set_value(locked_document, "driving_license_transmission", transmission)

        if is_identity:
            profile.user.save(update_fields=["first_name", "last_name"])
            profile.save(update_fields=["date_of_birth", "updated_at"])
        if changes:
            DocumentVerificationChange.objects.create(document=locked_document, manager=manager, changes=changes)

        locked_document.status = ClientDocument.Status.VALIDE
        locked_document.rejection_reason = ""
        locked_document.validated_at = timezone.now()
        locked_document.validated_by = manager
        locked_document.is_active = True
        locked_document.save(
            update_fields=[
                "status",
                "rejection_reason",
                "validated_at",
                "validated_by",
                "is_active",
                "driving_license_category",
                "driving_license_transmission",
                "verified_date_of_birth",
                "document_number",
                "expiration_date",
                "updated_at",
            ]
        )

        recalculate_profile_status(profile)

        message = f"Votre document {locked_document.get_document_type_display()} a ete valide."
        def _notify_and_send_email_once() -> None:
            notification = _notify_once(
                user=locked_document.client.user,
                notification_type="DOCUMENT_VALIDATED",
                title="Document valide",
                message=message,
                related_object_type="document",
                related_object_id=locked_document.id,
            )
            if notification is None:
                return
            _send_validated_document_email(document=locked_document)

        if not is_metadata_reverification:
            transaction.on_commit(_notify_and_send_email_once)

        document.status = locked_document.status
        document.rejection_reason = locked_document.rejection_reason
        document.validated_at = locked_document.validated_at
        document.validated_by = locked_document.validated_by
        document.is_active = locked_document.is_active
        document.driving_license_category = locked_document.driving_license_category
        document.driving_license_transmission = locked_document.driving_license_transmission
        document.verified_date_of_birth = locked_document.verified_date_of_birth
        document.document_number = locked_document.document_number
        document.expiration_date = locked_document.expiration_date
        document.client = profile

    return document


def reject_document(*, document, manager, reason):
    if not _is_manager(manager):
        raise ValueError("Seul un gestionnaire-comptable peut refuser ce document.")

    cleaned_reason = (reason or "").strip()
    if not cleaned_reason:
        raise ValueError("Le motif de refus est obligatoire.")

    max_length = ClientDocument._meta.get_field("rejection_reason").max_length
    if max_length is not None and len(cleaned_reason) > max_length:
        raise ValueError(f"Le motif de refus ne peut pas depasser {max_length} caracteres.")

    with transaction.atomic():
        locked_document = (
            ClientDocument.objects.select_for_update()
            .select_related("client", "client__user", "validated_by")
            .get(pk=document.pk)
        )

        if locked_document.status == ClientDocument.Status.REFUSE:
            raise ValueError("Ce document est deja refuse.")

        locked_document.status = ClientDocument.Status.REFUSE
        locked_document.rejection_reason = cleaned_reason
        locked_document.validated_at = timezone.now()
        locked_document.validated_by = manager
        locked_document.save(
            update_fields=[
                "status",
                "rejection_reason",
                "validated_at",
                "validated_by",
                "updated_at",
            ]
        )

        recalculate_profile_status(locked_document.client)

        message = (
            f"Votre document {locked_document.get_document_type_display()} a ete refuse. "
            f"Motif: {cleaned_reason}"
        )
        def _notify_and_send_email_once() -> None:
            notification = _notify_once(
                user=locked_document.client.user,
                notification_type="DOCUMENT_REJECTED",
                title="Document refuse",
                message=message,
                related_object_type="document",
                related_object_id=locked_document.id,
            )
            if notification is None:
                return
            _send_rejected_document_email(document=locked_document)

        transaction.on_commit(_notify_and_send_email_once)

        document.status = locked_document.status
        document.rejection_reason = locked_document.rejection_reason
        document.validated_at = locked_document.validated_at
        document.validated_by = locked_document.validated_by
        document.is_active = locked_document.is_active

    return document
