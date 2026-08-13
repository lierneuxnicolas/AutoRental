from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from typing import Any

from vehicles.models import Vehicle
from vehicles.services.availability import validate_availability_period


DECIMAL_QUANTIZER = Decimal("0.01")
HOURS_PER_DAY = Decimal("24")
FIXED_DEPOSIT_AMOUNT = Decimal("500.00")
INSURANCE_STANDARD = "STANDARD"
INSURANCE_DUO = "DUO"
INSURANCE_OMNIUM = "OMNIUM"
INSURANCE_DAILY_RATES = {
    INSURANCE_STANDARD: Decimal("0.00"),
    INSURANCE_DUO: Decimal("8.00"),
    INSURANCE_OMNIUM: Decimal("25.00"),
}


@dataclass(frozen=True)
class PriceSimulationResult:
    vehicle_id: int
    duration_hours: Decimal
    rental_amount: Decimal
    deposit_amount: Decimal
    insurance_type: str
    insurance_amount: Decimal
    insurance_included: bool
    total_amount: Decimal
    pricing_method: str
    billed_hours: int | None = None
    billed_days: int | None = None


class PricingError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def __str__(self) -> str:
        return self.message


def _raise_pricing_error(code: str, message: str) -> None:
    raise PricingError(code=code, message=message)


def _quantize_amount(value: Decimal) -> Decimal:
    return value.quantize(DECIMAL_QUANTIZER, rounding=ROUND_HALF_UP)


def _to_decimal(value: Any) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _calculate_duration_hours(*, start_at, end_at) -> Decimal:
    validated_period = validate_availability_period(start=start_at, end=end_at)
    duration = validated_period["end"] - validated_period["start"]
    duration_hours = (
        (Decimal(duration.days) * HOURS_PER_DAY)
        + Decimal(duration.seconds) / Decimal("3600")
        + Decimal(duration.microseconds) / Decimal("3600000000")
    )
    return duration_hours


def _ceil_decimal(value: Decimal) -> Decimal:
    return value.to_integral_value(rounding=ROUND_CEILING)


def normalize_insurance_type(insurance_type: str | None) -> str:
    raw_value = (insurance_type or INSURANCE_STANDARD).strip().upper()
    if raw_value not in INSURANCE_DAILY_RATES:
        _raise_pricing_error("INVALID_INSURANCE", "Le type d'assurance est invalide.")
    return raw_value


def calculate_price_simulation(*, vehicle, start_at, end_at, insurance_type: str = INSURANCE_STANDARD) -> PriceSimulationResult:
    if vehicle is None:
        _raise_pricing_error("VEHICLE_REQUIRED", "Un vehicule est obligatoire.")

    vehicle_id = getattr(vehicle, "pk", None)
    if vehicle_id is None:
        _raise_pricing_error("VEHICLE_REQUIRED", "Un vehicule valide est obligatoire.")

    vehicle = Vehicle.objects.select_related("category").filter(pk=vehicle_id).first()
    if vehicle is None:
        _raise_pricing_error("VEHICLE_NOT_FOUND", "Le vehicule demande est introuvable.")

    if not vehicle.is_active:
        _raise_pricing_error("VEHICLE_NOT_ACTIVE", "Le vehicule demande est inactif.")

    category = getattr(vehicle, "category", None)
    if category is None:
        _raise_pricing_error("PRICING_NOT_CONFIGURED", "La categorie du vehicule est indisponible.")

    if not category.is_active:
        _raise_pricing_error("CATEGORY_INACTIVE", "La categorie du vehicule est inactive.")

    duration_hours = _calculate_duration_hours(start_at=start_at, end_at=end_at)

    minimum_rental_hours = int(category.minimum_rental_hours)
    if duration_hours < Decimal(minimum_rental_hours):
        _raise_pricing_error(
            "DURATION_TOO_SHORT",
            "La duree demandee est inferieure a la duree minimale requise.",
        )

    daily_rate = getattr(category, "daily_rate", None)
    hourly_rate = getattr(category, "hourly_rate", None)
    deposit_amount = FIXED_DEPOSIT_AMOUNT

    if daily_rate is None and hourly_rate is None:
        _raise_pricing_error(
            "PRICING_NOT_CONFIGURED",
            "Aucun tarif n'est configure pour cette categorie.",
        )

    normalized_insurance = normalize_insurance_type(insurance_type)
    deposit_amount = _quantize_amount(_to_decimal(deposit_amount))
    billed_hours = int(_ceil_decimal(duration_hours))
    billed_days = int(_ceil_decimal(duration_hours / HOURS_PER_DAY))

    pricing_method = "DAILY" if hourly_rate is None else "HOURLY"
    rental_amount = None

    if hourly_rate is not None:
        hourly_amount = _quantize_amount(_to_decimal(hourly_rate) * Decimal(billed_hours))
        rental_amount = hourly_amount
        pricing_method = "HOURLY"

    if daily_rate is not None:
        daily_amount = _quantize_amount(_to_decimal(daily_rate) * Decimal(billed_days))
        if rental_amount is None or daily_amount < rental_amount:
            rental_amount = daily_amount
            pricing_method = "DAILY"

    if rental_amount is None:
        _raise_pricing_error(
            "PRICING_NOT_CONFIGURED",
            "Aucun tarif exploitable n'est configure pour cette categorie.",
        )

    insurance_daily_rate = INSURANCE_DAILY_RATES[normalized_insurance]
    insurance_amount = _quantize_amount(insurance_daily_rate * Decimal(billed_days))
    total_amount = _quantize_amount(rental_amount + insurance_amount)

    return PriceSimulationResult(
        vehicle_id=vehicle.pk,
        duration_hours=_quantize_amount(duration_hours),
        rental_amount=rental_amount,
        deposit_amount=deposit_amount,
        insurance_type=normalized_insurance,
        insurance_amount=insurance_amount,
        insurance_included=True,
        total_amount=total_amount,
        pricing_method=pricing_method,
        billed_hours=billed_hours,
        billed_days=billed_days,
    )