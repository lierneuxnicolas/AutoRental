from django.db import transaction
from django.utils import timezone

from accounts.models import ClientDocument, Role
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


def validate_document(*, document, manager):
    if not _is_manager(manager):
        raise ValueError("Seul un gestionnaire-comptable peut valider ce document.")

    with transaction.atomic():
        locked_document = (
            ClientDocument.objects.select_for_update()
            .select_related("client", "client__user", "validated_by")
            .get(pk=document.pk)
        )

        if not locked_document.is_active:
            raise ValueError("Ce document est inactif et ne peut pas etre valide.")

        if locked_document.status == ClientDocument.Status.VALIDE:
            raise ValueError("Ce document est deja valide.")

        today = timezone.localdate()
        if locked_document.expiration_date is None or locked_document.expiration_date <= today:
            raise ValueError("La date d'expiration du document doit etre strictement future.")

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
                "updated_at",
            ]
        )

        recalculate_profile_status(locked_document.client)

        message = f"Votre document {locked_document.document_type} a ete valide."
        transaction.on_commit(
            lambda: _notify_once(
                user=locked_document.client.user,
                notification_type="DOCUMENT_VALIDATED",
                title="Document valide",
                message=message,
                related_object_type="ClientDocument",
                related_object_id=locked_document.id,
            )
        )

        document.status = locked_document.status
        document.rejection_reason = locked_document.rejection_reason
        document.validated_at = locked_document.validated_at
        document.validated_by = locked_document.validated_by
        document.is_active = locked_document.is_active

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
        transaction.on_commit(
            lambda: _notify_once(
                user=locked_document.client.user,
                notification_type="DOCUMENT_REJECTED",
                title="Document refuse",
                message=message,
                related_object_type="ClientDocument",
                related_object_id=locked_document.id,
            )
        )

        document.status = locked_document.status
        document.rejection_reason = locked_document.rejection_reason
        document.validated_at = locked_document.validated_at
        document.validated_by = locked_document.validated_by
        document.is_active = locked_document.is_active

    return document
