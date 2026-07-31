from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile


def _has_text(value) -> bool:
    if value is None:
        return False
    return str(value).strip() != ""


def _personal_information_complete(client_profile):
    return all(
        [
            _has_text(client_profile.user.first_name),
            _has_text(client_profile.user.last_name),
            _has_text(client_profile.user.phone),
            client_profile.date_of_birth is not None,
            _has_text(client_profile.address),
        ]
    )


def _required_documents_state(client_profile):
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

    has_refused = any(
        doc is not None and doc.status == ClientDocument.Status.REFUSE
        for doc in by_type.values()
    )

    has_expired = any(
        doc is not None
        and (
            doc.status == ClientDocument.Status.EXPIRE
            or (doc.expiration_date is not None and doc.expiration_date <= today)
        )
        for doc in by_type.values()
    )

    all_valid_non_expired = all(
        doc is not None
        and doc.status == ClientDocument.Status.VALIDE
        and doc.expiration_date is not None
        and doc.expiration_date > today
        for doc in by_type.values()
    )

    has_pending = any(
        doc is not None and doc.status == ClientDocument.Status.EN_ATTENTE
        for doc in by_type.values()
    )

    return {
        "all_present": all_present,
        "has_refused": has_refused,
        "has_expired": has_expired,
        "all_valid_non_expired": all_valid_non_expired,
        "has_pending": has_pending,
    }


def recalculate_profile_status(client_profile):
    required_state = _required_documents_state(client_profile)

    if required_state["has_refused"]:
        target_status = ClientProfile.ProfileStatus.REFUSE
    elif required_state["has_expired"]:
        target_status = ClientProfile.ProfileStatus.EXPIRE
    else:
        email_verified = bool(client_profile.user.email_verified)
        personal_information_complete = _personal_information_complete(client_profile)

        if (
            email_verified
            and personal_information_complete
            and required_state["all_present"]
            and required_state["all_valid_non_expired"]
        ):
            target_status = ClientProfile.ProfileStatus.VALIDE
        elif required_state["all_present"] and required_state["has_pending"] and not required_state["has_refused"]:
            target_status = ClientProfile.ProfileStatus.EN_ATTENTE
        else:
            target_status = ClientProfile.ProfileStatus.INCOMPLET

    if client_profile.profile_status != target_status:
        client_profile.profile_status = target_status
        client_profile.save(update_fields=["profile_status", "updated_at"])

    return client_profile.profile_status
