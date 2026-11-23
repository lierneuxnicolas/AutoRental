from pathlib import PurePosixPath
from uuid import uuid4

from common.models import SystemLog
from django.db import DatabaseError, transaction
from django.db.models import Q
from django.utils import timezone
from inspections.models import Inspection
from notifications.models import Notification

from accounts.models import AccountErasureRequest, ClientDocument, ClientProfile, DocumentVerificationChange, User
from accounts.services.account_erasure import _deferral_reason


def _delete_document_file(document):
    name = document.file.name
    if not name:
        return ""
    path = PurePosixPath(name)
    if (
        len(path.parts) < 2 or path.parts[0] != "client_documents"
        or ".." in path.parts or path.as_posix() != name or chr(92) in name
        or ClientDocument.objects.filter(file=name).exclude(client_id=document.client_id).exists()
    ):
        return "FILE_REFERENCE_UNSAFE"

    storage = document.file.storage
    try:
        if storage.exists(name):
            storage.delete(name)
        if storage.exists(name):
            return "FILE_DELETE_FAILED"
    except Exception:
        # Storage adapters raise different exceptions, which may contain personal paths.
        return "FILE_DELETE_FAILED"
    return ""


def _erase_personal_data(user):
    documents = ClientDocument.objects.filter(client__user=user)
    locked_documents = list(documents.select_for_update().order_by("pk"))
    for document in locked_documents:
        error = _delete_document_file(document)
        if error:
            return error
    for document in locked_documents:
        for action, decision in (("DOCUMENT_VALIDATED", "valide"), ("DOCUMENT_REJECTED", "refuse")):
            message = f"Document #{document.pk} ({document.document_type}) {decision}"
            SystemLog.objects.filter(action=action, message__startswith=f"{message} pour client ").update(
                message=f"{message}.",
            )
    DocumentVerificationChange.objects.filter(document__in=documents).delete()
    documents.delete()

    email = f"closed-{uuid4().hex}@getacar.invalid"
    while User.objects.filter(email=email).exists():
        email = f"closed-{uuid4().hex}@getacar.invalid"
    User.objects.filter(pk=user.pk).update(
        email=email, first_name="", last_name="", phone="", email_verified=False, last_login=None,
    )
    ClientProfile.objects.filter(user=user).update(date_of_birth=None, address="", rejection_reason="")
    Notification.objects.filter(user=user).delete()

    # Keep observations when an inspection contains evidence or has financial links.
    Inspection.objects.filter(
        reservation__client__user=user, has_critical_issue=False, critical_issue_description="",
        status__in=(Inspection.Status.BROUILLON, Inspection.Status.ANNULE),
    ).exclude(
        Q(damages__isnull=False) | Q(photos__isnull=False) | Q(interventions__isnull=False)
        | Q(reservation__payments__isnull=False) | Q(reservation__deposits__isnull=False)
        | Q(reservation__invoices__isnull=False)
    ).update(comments="")
    return ""


@transaction.atomic
def process_closed_account_erasure(request_id):
    request = AccountErasureRequest.objects.get(pk=request_id)
    user = User.objects.select_for_update().get(pk=request.user_id)
    request = AccountErasureRequest.objects.select_for_update().get(pk=request_id)
    states = AccountErasureRequest.ProcessingStatus
    if request.status != AccountErasureRequest.Status.CLOSED or request.processing_status == states.COMPLETED:
        return request

    request.processed_at = timezone.now()
    request.processing_error = ""
    if not user.account_closed_at or user.is_active or request.retention_hold or _deferral_reason(user.pk):
        request.processing_status = states.HELD
    else:
        try:
            with transaction.atomic():
                request.processing_error = _erase_personal_data(user)
        except DatabaseError:
            # Original file references survive the rollback so the attempt can be retried.
            request.processing_error = "DATABASE_ERROR"
        request.processing_status = states.FAILED if request.processing_error else states.COMPLETED
    request.save(update_fields=["processed_at", "processing_status", "processing_error"])
    return request
