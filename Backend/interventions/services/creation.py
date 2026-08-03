from __future__ import annotations

import secrets
import string
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone

from interventions.models import Intervention
from reservations.models import Reservation
from vehicles.models import Vehicle


REFERENCE_PREFIX = "INT"
REFERENCE_RANDOM_ALPHABET = string.ascii_uppercase + string.digits
REFERENCE_RANDOM_LENGTH = 8
REFERENCE_GENERATION_MAX_ATTEMPTS = 10


@dataclass(frozen=True)
class InterventionCreationError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _raise_creation_error(code: str, message: str) -> None:
    raise InterventionCreationError(code=code, message=message)


def _generate_reference() -> str:
    year = timezone.localdate().year
    random_part = "".join(secrets.choice(REFERENCE_RANDOM_ALPHABET) for _ in range(REFERENCE_RANDOM_LENGTH))
    return f"{REFERENCE_PREFIX}-{year}-{random_part}"


def _resolve_creation_inputs(*, vehicle_id: int, reservation_id: int | None):
    vehicle = Vehicle.objects.filter(pk=vehicle_id).first()
    reservation = Reservation.objects.filter(pk=reservation_id).first() if reservation_id is not None else None
    return vehicle, reservation


def create_intervention(*, vehicle_id: int, reservation_id: int | None, intervention_type: str, description: str, created_by):
    vehicle, reservation = _resolve_creation_inputs(vehicle_id=vehicle_id, reservation_id=reservation_id)

    if vehicle is None:
        _raise_creation_error("VEHICLE_REQUIRED", "Le vehicule est obligatoire.")

    if created_by is None or not getattr(created_by, "is_authenticated", False):
        _raise_creation_error("AUTH_REQUIRED", "Authentification requise.")

    if not getattr(created_by, "is_active", False):
        _raise_creation_error("CREATOR_INACTIVE", "Le createur est inactif.")

    if reservation is not None and reservation.vehicle_id != vehicle.id:
        _raise_creation_error(
            "RESERVATION_VEHICLE_MISMATCH",
            "La reservation ne correspond pas au vehicule fourni.",
        )

    attempts = REFERENCE_GENERATION_MAX_ATTEMPTS
    for attempt in range(attempts):
        reference = _generate_reference()
        try:
            with transaction.atomic():
                return Intervention.objects.create(
                    reference=reference,
                    vehicle=vehicle,
                    reservation=reservation,
                    intervention_type=intervention_type,
                    description=description or "",
                    created_by=created_by,
                )
        except IntegrityError:
            if attempt == attempts - 1:
                break

    _raise_creation_error(
        "REFERENCE_GENERATION_FAILED",
        "Impossible de generer une reference d'intervention unique.",
    )
