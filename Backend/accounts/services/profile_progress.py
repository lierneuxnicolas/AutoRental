from django.utils import timezone

from accounts.models import ClientDocument


def _has_text(value) -> bool:
    if value is None:
        return False
    return str(value).strip() != ""


def calculate_profile_progress(client_profile):
    today = timezone.localdate()

    account_created = True
    email_verified = bool(client_profile.user.email_verified)
    personal_information_complete = all(
        [
            _has_text(client_profile.user.first_name),
            _has_text(client_profile.user.last_name),
            _has_text(client_profile.user.phone),
            client_profile.date_of_birth is not None,
            _has_text(client_profile.address),
        ]
    )

    valid_document_types = set(
        ClientDocument.objects.filter(
            client=client_profile,
            is_active=True,
            status=ClientDocument.Status.VALIDE,
            expiration_date__gte=today,
            document_type__in=[
                ClientDocument.DocumentType.CARTE_IDENTITE,
                ClientDocument.DocumentType.PERMIS_CONDUIRE,
            ],
        )
        .values_list("document_type", flat=True)
        .distinct()
    )

    identity_card_valid = ClientDocument.DocumentType.CARTE_IDENTITE in valid_document_types
    driving_license_valid = ClientDocument.DocumentType.PERMIS_CONDUIRE in valid_document_types

    criteria = [
        account_created,
        email_verified,
        personal_information_complete,
        identity_card_valid,
        driving_license_valid,
    ]
    percentage = max(0, min(100, sum(1 for criterion in criteria if criterion) * 20))

    return {
        "percentage": percentage,
        "account_created": account_created,
        "email_verified": email_verified,
        "personal_information_complete": personal_information_complete,
        "identity_card_valid": identity_card_valid,
        "driving_license_valid": driving_license_valid,
    }