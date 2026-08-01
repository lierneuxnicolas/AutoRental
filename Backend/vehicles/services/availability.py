from __future__ import annotations

from datetime import datetime
from numbers import Real

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db.models import Exists, OuterRef
from django.utils import timezone

from vehicles.models import Vehicle


class AvailabilityValidationError(ValueError):
    """Business validation error for vehicle availability period checks."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _raise_validation_error(code, message):
    raise AvailabilityValidationError(code=code, message=message)


BOOKABLE_VEHICLE_STATUSES = (Vehicle.Status.DISPONIBLE,)


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


def _get_reservation_model():
    """Return the Reservation model expected by availability search.

    The model is loaded lazily to avoid circular imports.
    """

    try:
        reservation_model = apps.get_model("reservations", "Reservation")
    except LookupError as exc:
        raise ImproperlyConfigured(
            "The reservations.Reservation model is required for vehicle availability search."
        ) from exc

    if reservation_model is None:
        raise ImproperlyConfigured(
            "The reservations.Reservation model is required for vehicle availability search."
        )

    return reservation_model


def _get_reservation_statuses():
    """Return the Reservation statuses used by availability checks.

    Decision for point 39B:
    - BROUILLON does not block.
    - EN_ATTENTE_CAUTION does not block yet because there is no hold expiry.
    - EN_ATTENTE_PAIEMENT blocks temporarily.
    - CONFIRMEE and EN_COURS block.
    - All other statuses do not block.
    """

    reservation_model = _get_reservation_model()
    return (
        reservation_model.Status.EN_ATTENTE_PAIEMENT,
        reservation_model.Status.CONFIRMEE,
        reservation_model.Status.EN_COURS,
    )


def get_blocking_reservation_statuses():
    """Return blocking reservation statuses for availability filtering.

    Decision for point 39B:
    - BROUILLON does not block.
    - EN_ATTENTE_CAUTION does not block yet because there is no hold expiry.
    - EN_ATTENTE_PAIEMENT blocks temporarily.
    - CONFIRMEE and EN_COURS block.
    - All other statuses do not block.
    """

    return _get_reservation_statuses()


def _get_reservation_queryset(*, reservation_queryset=None):
    if reservation_queryset is not None:
        return reservation_queryset
    return _get_reservation_model().objects.all()


def _build_conflict_filter(*, start, end, reservation_queryset=None):
    """Return the strict overlap predicate for blocking reservations.

    existing_start < requested_end AND existing_end > requested_start
    means a reservation ending exactly at the requested start does not overlap,
    and a reservation starting exactly at the requested end does not overlap.
    """

    return {
        "status__in": get_blocking_reservation_statuses(),
        "start_at__lt": end,
        "end_at__gt": start,
    }


def is_vehicle_available(*, vehicle, start, end, reservation_queryset=None) -> bool:
    """Return whether a single vehicle is available for the requested period.

    This function is the single source of truth for the overlap rule and MUST
    be called at every step where availability must be confirmed:

    1. Reservation creation (point 39) — optimistic check before writing the
       Reservation row.
    2. Before creating a PaymentIntent (point 41) — confirm the vehicle is
       still available before charging the customer.
    3. Stripe webhook (point 42) — re-verify inside an atomic transaction
       before marking the reservation CONFIRMEE.

    Concurrency
    -----------
    This check alone does NOT protect against two simultaneous payments for the
    same vehicle.  Each call site that writes data MUST wrap the check inside a
    database transaction and lock the relevant row first::

        with transaction.atomic():
            vehicle = Vehicle.objects.select_for_update().get(pk=vehicle_id)
            if not is_vehicle_available(vehicle=vehicle, start=start, end=end):
                raise ConflictError(...)
            Reservation.objects.create(...)

    The Stripe webhook must additionally be idempotent (ignore duplicate
    events for the same payment_intent_id).
    """

    period = validate_availability_period(start=start, end=end)
    reservation_queryset = _get_reservation_queryset(reservation_queryset=reservation_queryset)

    conflict_exists = reservation_queryset.filter(
        vehicle_id=vehicle.pk,
        **_build_conflict_filter(
            start=period["start"],
            end=period["end"],
            reservation_queryset=reservation_queryset,
        ),
    ).exists()

    return (
        vehicle.is_active
        and vehicle.status in BOOKABLE_VEHICLE_STATUSES
        and vehicle.brand.is_active
        and vehicle.category.is_active
        and not conflict_exists
    )


def get_available_vehicles(*, start, end, base_queryset=None, reservation_queryset=None):
    """Return vehicles available for the requested period.

    The overlap rule is strict: existing_start < requested_end AND
    existing_end > requested_start.
    """

    period = validate_availability_period(start=start, end=end)
    reservation_queryset = _get_reservation_queryset(reservation_queryset=reservation_queryset)

    queryset = base_queryset if base_queryset is not None else Vehicle.objects.all()
    queryset = queryset.filter(
        is_active=True,
        status__in=BOOKABLE_VEHICLE_STATUSES,
        brand__is_active=True,
        category__is_active=True,
    )

    conflicting_reservations = reservation_queryset.filter(
        vehicle_id=OuterRef("pk"),
        **_build_conflict_filter(
            start=period["start"],
            end=period["end"],
            reservation_queryset=reservation_queryset,
        ),
    )

    return queryset.annotate(
        _has_conflicting_reservation=Exists(conflicting_reservations),
    ).filter(_has_conflicting_reservation=False).distinct()


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