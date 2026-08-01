from __future__ import annotations

from datetime import datetime
from numbers import Real

from django.conf import settings
from django.utils import timezone


class AvailabilityValidationError(ValueError):
    """Business validation error for vehicle availability period checks."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _raise_validation_error(code, message):
    raise AvailabilityValidationError(code=code, message=message)


def _normalize_datetime(value, *, field_name, invalid_code):
    if value is None:
        required_code = "START_REQUIRED" if field_name == "start" else "END_REQUIRED"
        required_label = "de debut" if field_name == "start" else "de fin"
        _raise_validation_error(required_code, f"La date {required_label} est obligatoire.")

    if not isinstance(value, datetime):
        _raise_validation_error(invalid_code, f"La date {field_name} doit etre un datetime valide.")

    if settings.USE_TZ and timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_default_timezone())

    return value


def calculate_duration_hours(start, end):
    """Return the exact duration in hours between two datetimes.

    The function validates that both arguments are datetimes, normalizes naive
    datetimes when timezone support is enabled, and rejects non-positive periods.
    """

    normalized_start = _normalize_datetime(start, field_name="start", invalid_code="INVALID_START")
    normalized_end = _normalize_datetime(end, field_name="end", invalid_code="INVALID_END")

    if normalized_end <= normalized_start:
        _raise_validation_error(
            "END_BEFORE_START",
            "La date de fin doit etre strictement superieure a la date de debut.",
        )

    return (normalized_end - normalized_start).total_seconds() / 3600


def validate_availability_period(*, start, end, minimum_hours=None):
    """Validate a vehicle search period and return normalized values.

    On success, the function returns a dictionary containing the normalized
    start and end datetimes and the exact duration in hours.
    """

    normalized_start = _normalize_datetime(start, field_name="start", invalid_code="INVALID_START")
    normalized_end = _normalize_datetime(end, field_name="end", invalid_code="INVALID_END")

    now = timezone.now() if settings.USE_TZ else datetime.now()
    if normalized_start < now:
        _raise_validation_error(
            "START_IN_PAST",
            "La date de debut ne peut pas etre dans le passe.",
        )

    if minimum_hours is not None:
        if isinstance(minimum_hours, bool) or not isinstance(minimum_hours, Real) or minimum_hours < 0:
            _raise_validation_error(
                "INVALID_MINIMUM_HOURS",
                "La duree minimale doit etre un nombre positif ou nul.",
            )

    duration_hours = calculate_duration_hours(normalized_start, normalized_end)

    if minimum_hours is not None and duration_hours < minimum_hours:
        _raise_validation_error(
            "DURATION_TOO_SHORT",
            "La periode demandee est inferieure a la duree minimale requise.",
        )

    return {
        "start": normalized_start,
        "end": normalized_end,
        "duration_hours": duration_hours,
    }