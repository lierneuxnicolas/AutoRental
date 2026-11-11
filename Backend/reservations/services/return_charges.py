from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal


@dataclass(frozen=True)
class ReturnCharges:
    delay: timedelta
    delay_fee: Decimal
    fuel_fee: Decimal | None


def calculate_return_charges(
    *,
    scheduled_return: datetime,
    actual_return: datetime,
    departure_fuel: int | None,
    return_fuel: int | None,
) -> ReturnCharges:
    delay = max(actual_return - scheduled_return, timedelta(0))
    if delay <= timedelta(minutes=30):
        delay_fee = Decimal("0.00")
    elif delay <= timedelta(hours=3):
        delay_fee = Decimal("40.00")
    elif delay <= timedelta(hours=24):
        delay_fee = Decimal("80.00")
    else:
        excess = delay - timedelta(hours=24)
        additional_days = (excess - timedelta(microseconds=1)) // timedelta(hours=24) + 1
        delay_fee = Decimal("80.00") + Decimal("160.00") * additional_days

    if departure_fuel is None or return_fuel is None:
        fuel_fee = None
    elif departure_fuel >= 90 and return_fuel < 90:
        fuel_fee = Decimal("20.00")
    else:
        fuel_fee = Decimal("0.00")

    return ReturnCharges(delay=delay, delay_fee=delay_fee, fuel_fee=fuel_fee)
