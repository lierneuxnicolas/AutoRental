from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from accounts.models import ClientProfile
from accounts.services import validate_client_for_reservation
from notifications.services import create_notification
from reservations.models import Reservation
from reservations.services.pricing import PricingError, calculate_price_simulation
from vehicles.models import Vehicle
from vehicles.services import AvailabilityValidationError, is_vehicle_available, validate_availability_period


@dataclass(frozen=True)
class ReservationCreationError(ValueError):
    """Stable business exception raised by draft reservation creation."""

    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _raise_reservation_creation_error(
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> None:
    raise ReservationCreationError(code=code, message=message, details=details)


def _find_identical_draft(
    *,
    client: ClientProfile,
    vehicle: Vehicle,
    start_at: datetime,
    end_at: datetime,
) -> Reservation | None:
    """Return an existing identical draft if one already exists.

    Strategy for point 39C:
    return the existing draft instead of creating duplicates.
    """

    return (
        Reservation.objects.filter(
            client=client,
            vehicle=vehicle,
            start_at=start_at,
            end_at=end_at,
            status=Reservation.Status.BROUILLON,
        )
        .order_by("-id")
        .first()
    )


def _validate_client_eligibility(*, client: ClientProfile, start_at: datetime, end_at: datetime) -> None:
    try:
        eligibility = validate_client_for_reservation(
            client=client,
            reservation_start_date=start_at.date(),
            reservation_end_date=end_at.date(),
        )
    except ValidationError as exc:
        _raise_reservation_creation_error(
            "INVALID_CLIENT",
            "Le profil client fourni est invalide.",
            details={"validation_errors": list(exc.messages)},
        )

    if eligibility.is_eligible:
        return

    if "INVALID_ROLE" in eligibility.errors:
        _raise_reservation_creation_error(
            "INVALID_ROLE",
            "Le role utilisateur ne permet pas la creation d'une reservation.",
            details={"eligibility_errors": list(eligibility.errors)},
        )

    _raise_reservation_creation_error(
        "PROFILE_NOT_ELIGIBLE",
        "Le profil client ne remplit pas les conditions de reservation.",
        details={"eligibility_errors": list(eligibility.errors)},
    )


def _normalize_period(*, start_at: datetime, end_at: datetime) -> tuple[datetime, datetime]:
    try:
        period = validate_availability_period(start=start_at, end=end_at)
    except AvailabilityValidationError as exc:
        _raise_reservation_creation_error(
            "INVALID_PERIOD",
            "La periode de reservation est invalide.",
            details={"availability_error": exc.code},
        )

    return period["start"], period["end"]


def _ensure_vehicle_bookable(*, vehicle: Vehicle) -> None:
    if not vehicle.is_active:
        _raise_reservation_creation_error(
            "VEHICLE_NOT_ACTIVE",
            "Le vehicule est inactif.",
        )

    if vehicle.status != Vehicle.Status.DISPONIBLE:
        _raise_reservation_creation_error(
            "VEHICLE_NOT_BOOKABLE",
            "Le vehicule n'est pas reservable dans son statut actuel.",
            details={"vehicle_status": vehicle.status},
        )


def create_draft_reservation(
    *,
    client: ClientProfile,
    vehicle: Vehicle,
    start_at: datetime,
    end_at: datetime,
    insurance_type: str = Reservation.InsuranceType.STANDARD,
) -> Reservation:
    """Create a draft reservation after all business checks pass.

    This service:
    - validates client eligibility through the existing profile validation service,
    - validates period and availability through the existing availability service,
    - recalculates rental/deposit amounts using backend pricing only,
    - creates Reservation with status BROUILLON inside an atomic transaction,
    - locks the vehicle row and re-checks status + availability before insert,
    - returns an existing identical draft instead of creating duplicates.

    It intentionally does not create payment/caution records and does not change
    vehicle status for draft creation.
    """

    if client is None or not isinstance(client, ClientProfile):
        _raise_reservation_creation_error("INVALID_CLIENT", "Un profil client valide est obligatoire.")

    user = getattr(client, "user", None)
    if user is None:
        _raise_reservation_creation_error("INVALID_CLIENT", "Le profil client n'est lie a aucun utilisateur.")

    if vehicle is None:
        _raise_reservation_creation_error("VEHICLE_NOT_ACTIVE", "Un vehicule valide est obligatoire.")

    vehicle_id = getattr(vehicle, "pk", None)
    if vehicle_id is None:
        _raise_reservation_creation_error("VEHICLE_NOT_ACTIVE", "Le vehicule fourni est invalide.")

    normalized_start_at, normalized_end_at = _normalize_period(start_at=start_at, end_at=end_at)
    _validate_client_eligibility(client=client, start_at=normalized_start_at, end_at=normalized_end_at)

    current_vehicle = Vehicle.objects.select_related("category", "brand").filter(pk=vehicle_id).first()
    if current_vehicle is None:
        _raise_reservation_creation_error("VEHICLE_NOT_ACTIVE", "Le vehicule demande est introuvable.")

    _ensure_vehicle_bookable(vehicle=current_vehicle)

    if not is_vehicle_available(vehicle=current_vehicle, start=normalized_start_at, end=normalized_end_at):
        _raise_reservation_creation_error(
            "VEHICLE_UNAVAILABLE",
            "Le vehicule n'est pas disponible sur cette periode.",
        )

    existing_draft = _find_identical_draft(
        client=client,
        vehicle=current_vehicle,
        start_at=normalized_start_at,
        end_at=normalized_end_at,
    )
    if existing_draft is not None:
        return existing_draft

    with transaction.atomic():
        locked_vehicle = Vehicle.objects.select_for_update().select_related("category", "brand").filter(pk=vehicle_id).first()
        if locked_vehicle is None:
            _raise_reservation_creation_error("VEHICLE_NOT_ACTIVE", "Le vehicule demande est introuvable.")

        _ensure_vehicle_bookable(vehicle=locked_vehicle)

        existing_draft = _find_identical_draft(
            client=client,
            vehicle=locked_vehicle,
            start_at=normalized_start_at,
            end_at=normalized_end_at,
        )
        if existing_draft is not None:
            return existing_draft

        if not is_vehicle_available(vehicle=locked_vehicle, start=normalized_start_at, end=normalized_end_at):
            _raise_reservation_creation_error(
                "VEHICLE_UNAVAILABLE",
                "Le vehicule n'est plus disponible sur cette periode.",
            )

        try:
            pricing = calculate_price_simulation(
                vehicle=locked_vehicle,
                start_at=normalized_start_at,
                end_at=normalized_end_at,
                insurance_type=insurance_type,
            )
        except PricingError as exc:
            _raise_reservation_creation_error(
                "PRICING_ERROR",
                "Impossible de calculer le prix de la reservation.",
                details={"pricing_error": exc.code},
            )
        except AvailabilityValidationError as exc:
            _raise_reservation_creation_error(
                "INVALID_PERIOD",
                "La periode de reservation est invalide.",
                details={"availability_error": exc.code},
            )

        reservation = Reservation.objects.create(
            client=client,
            vehicle=locked_vehicle,
            start_at=normalized_start_at,
            end_at=normalized_end_at,
            status=Reservation.Status.BROUILLON,
            rental_amount=pricing.rental_amount,
            insurance_type=pricing.insurance_type,
            deposit_amount=pricing.deposit_amount,
        )

        reference = reservation.reference
        client_user = client.user

        transaction.on_commit(
            lambda: create_notification(
                user=client_user,
                notification_type="RESERVATION_DRAFT_CREATED",
                title="Reservation creee",
                message=f"Votre reservation {reference} a ete creee.",
                related_object_type="reservation",
                related_object_id=reservation.id,
            )
        )

        return reservation
