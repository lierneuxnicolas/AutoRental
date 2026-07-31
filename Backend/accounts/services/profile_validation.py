from dataclasses import dataclass
from datetime import date

from django.core.exceptions import ValidationError

from accounts.models import ClientDocument, ClientProfile, Role


@dataclass(frozen=True)
class ClientEligibilityResult:
    is_eligible: bool
    errors: tuple[str, ...]


def calculate_age_on_date(date_of_birth: date, reference_date: date) -> int:
    """Return exact age in years at reference_date using month/day comparison."""
    if not isinstance(date_of_birth, date):
        raise ValidationError("INVALID_DATE_OF_BIRTH")
    if not isinstance(reference_date, date):
        raise ValidationError("INVALID_REFERENCE_DATE")
    if date_of_birth > reference_date:
        raise ValidationError("DATE_OF_BIRTH_IN_FUTURE")

    years = reference_date.year - date_of_birth.year
    if (reference_date.month, reference_date.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years


def _is_blank(value) -> bool:
    return value is None or str(value).strip() == ""


def validate_client_for_reservation(
    client: ClientProfile,
    reservation_start_date: date,
    reservation_end_date: date,
) -> ClientEligibilityResult:
    """Validate whether a ClientProfile can create a reservation for a date range.

    Contract:
    - client must be an instance of ClientProfile.
    - reservation_start_date and reservation_end_date must be valid date objects.

    Business ineligibility does not raise exceptions; it is returned as stable error codes.
    ValidationError is raised only for invalid input parameters.
    """
    if client is None or not isinstance(client, ClientProfile):
        raise ValidationError("INVALID_CLIENT_PROFILE")

    if reservation_start_date is None:
        raise ValidationError("RESERVATION_START_DATE_REQUIRED")
    if reservation_end_date is None:
        raise ValidationError("RESERVATION_END_DATE_REQUIRED")
    if not isinstance(reservation_start_date, date):
        raise ValidationError("INVALID_RESERVATION_START_DATE")
    if not isinstance(reservation_end_date, date):
        raise ValidationError("INVALID_RESERVATION_END_DATE")
    if reservation_end_date < reservation_start_date:
        raise ValidationError("INVALID_RESERVATION_DATE_RANGE")

    errors = []
    user = client.user

    if not user.is_active:
        errors.append("ACCOUNT_INACTIVE")

    if not user.email_verified:
        errors.append("EMAIL_NOT_VERIFIED")

    if not user.role or user.role.code != Role.Code.CLIENT:
        errors.append("INVALID_ROLE")

    personal_info_complete = all(
        [
            not _is_blank(user.first_name),
            not _is_blank(user.last_name),
            not _is_blank(user.phone),
            client.date_of_birth is not None,
            not _is_blank(client.address),
        ]
    )
    if not personal_info_complete:
        errors.append("PROFILE_INCOMPLETE")

    if client.date_of_birth is not None:
        age = calculate_age_on_date(client.date_of_birth, reservation_start_date)
        if age < 21:
            errors.append("UNDER_MINIMUM_AGE")

    if client.profile_status != ClientProfile.ProfileStatus.VALIDE:
        errors.append("PROFILE_NOT_VALID")

    required_types = {
        ClientDocument.DocumentType.CARTE_IDENTITE: {
            "missing": "IDENTITY_CARD_MISSING",
            "not_valid": "IDENTITY_CARD_NOT_VALID",
            "expires_too_soon": "IDENTITY_CARD_EXPIRES_TOO_SOON",
        },
        ClientDocument.DocumentType.PERMIS_CONDUIRE: {
            "missing": "DRIVING_LICENSE_MISSING",
            "not_valid": "DRIVING_LICENSE_NOT_VALID",
            "expires_too_soon": "DRIVING_LICENSE_EXPIRES_TOO_SOON",
        },
    }

    active_required_docs = {
        doc.document_type: doc
        for doc in ClientDocument.objects.filter(
            client=client,
            is_active=True,
            document_type__in=required_types.keys(),
        )
    }

    for doc_type, error_codes in required_types.items():
        doc = active_required_docs.get(doc_type)
        if doc is None:
            errors.append(error_codes["missing"])
            continue

        if doc.status != ClientDocument.Status.VALIDE:
            errors.append(error_codes["not_valid"])
            continue

        if doc.expiration_date is None or doc.expiration_date < reservation_end_date:
            errors.append(error_codes["expires_too_soon"])

    return ClientEligibilityResult(
        is_eligible=len(errors) == 0,
        errors=tuple(errors),
    )
