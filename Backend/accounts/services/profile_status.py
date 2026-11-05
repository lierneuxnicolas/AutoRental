from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile


def get_effective_document_status(document, *, today=None):
    today = today or timezone.localdate()
    if (
        document.status == ClientDocument.Status.VALIDE
        and document.expiration_date is not None
        and document.expiration_date < today
    ):
        return ClientDocument.Status.EXPIRE
    return document.status


def _has_text(value) -> bool:
    if value is None:
        return False
    return str(value).strip() != ""


def is_personal_information_complete(client_profile):
    return all(
        [
            _has_text(client_profile.user.first_name),
            _has_text(client_profile.user.last_name),
            _has_text(client_profile.user.phone),
            client_profile.date_of_birth is not None,
            _has_text(client_profile.address),
        ]
    )


def get_required_documents_state(client_profile):
    today = timezone.localdate()
    required_types = [
        ClientDocument.DocumentType.CARTE_IDENTITE,
        ClientDocument.DocumentType.PERMIS_CONDUIRE,
    ]

    docs = list(
        ClientDocument.objects.filter(
            client=client_profile,
            is_active=True,
            document_type__in=required_types,
        )
    )

    by_type = {doc_type: None for doc_type in required_types}
    for doc in docs:
        if by_type.get(doc.document_type) is None:
            by_type[doc.document_type] = doc

    all_present = all(by_type[doc_type] is not None for doc_type in required_types)
    document_issues = {}
    for doc_type, doc in by_type.items():
        if doc is None:
            issue = "MISSING"
        elif get_effective_document_status(doc, today=today) == ClientDocument.Status.EXPIRE:
            issue = "EXPIRED"
        elif doc.status == ClientDocument.Status.REFUSE:
            issue = "REFUSED"
        elif doc.status == ClientDocument.Status.EN_ATTENTE:
            issue = "PENDING"
        elif doc.status != ClientDocument.Status.VALIDE or doc.expiration_date is None:
            issue = "INVALID"
        elif (
            doc_type == ClientDocument.DocumentType.PERMIS_CONDUIRE
            and (
                doc.driving_license_category
                not in {
                    ClientDocument.DrivingLicenseCategory.B,
                    ClientDocument.DrivingLicenseCategory.BE,
                }
                or doc.driving_license_transmission
                not in ClientDocument.DrivingLicenseTransmission.values
            )
        ):
            issue = "VERIFICATION_PENDING"
        else:
            issue = None
        document_issues[doc_type] = issue

    has_client_document_action = any(
        issue in {"MISSING", "EXPIRED", "REFUSED", "INVALID"}
        for issue in document_issues.values()
    )
    has_refused = "REFUSED" in document_issues.values()
    has_expired = "EXPIRED" in document_issues.values()
    all_valid_non_expired = all(issue is None for issue in document_issues.values())

    return {
        "all_present": all_present,
        "all_valid_non_expired": all_valid_non_expired,
        "document_issues": document_issues,
        "has_client_document_action": has_client_document_action,
        "has_refused": has_refused,
        "has_expired": has_expired,
    }


def get_effective_profile_status(client_profile, *, required_state=None):
    required_state = required_state or get_required_documents_state(client_profile)

    email_verified = bool(client_profile.user.email_verified)
    personal_information_complete = is_personal_information_complete(client_profile)

    if required_state["has_expired"]:
        return ClientProfile.ProfileStatus.INCOMPLET
    if required_state["has_refused"]:
        return ClientProfile.ProfileStatus.REFUSE
    if (
        email_verified
        and personal_information_complete
        and required_state["all_valid_non_expired"]
    ):
        return ClientProfile.ProfileStatus.VALIDE
    has_manager_review_pending = any(
        issue in {"PENDING", "VERIFICATION_PENDING"}
        for issue in required_state["document_issues"].values()
    )
    if required_state["all_present"] and has_manager_review_pending:
        return ClientProfile.ProfileStatus.EN_ATTENTE
    return ClientProfile.ProfileStatus.INCOMPLET


def recalculate_profile_status(client_profile):
    target_status = get_effective_profile_status(client_profile)

    if client_profile.profile_status != target_status:
        client_profile.profile_status = target_status
        client_profile.save(update_fields=["profile_status", "updated_at"])

    return client_profile.profile_status
