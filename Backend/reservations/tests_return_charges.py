from datetime import datetime, timedelta, timezone
from decimal import Decimal

from django.test import SimpleTestCase

from reservations.services.return_charges import calculate_return_charges


class ReturnChargesTests(SimpleTestCase):
    def test_delay_boundaries(self):
        scheduled = datetime(2026, 1, 1, 10, tzinfo=timezone.utc)
        cases = [
            (timedelta(minutes=-1), "0.00"),
            (timedelta(minutes=30), "0.00"),
            (timedelta(minutes=30, microseconds=1), "40.00"),
            (timedelta(hours=3), "40.00"),
            (timedelta(hours=3, microseconds=1), "80.00"),
            (timedelta(hours=24), "80.00"),
            (timedelta(hours=24, microseconds=1), "240.00"),
            (timedelta(hours=48), "240.00"),
            (timedelta(hours=48, microseconds=1), "400.00"),
        ]
        for delay, expected in cases:
            with self.subTest(delay=delay):
                result = calculate_return_charges(
                    scheduled_return=scheduled,
                    actual_return=scheduled + delay,
                    departure_fuel=90,
                    return_fuel=90,
                )
                self.assertEqual(result.delay_fee, Decimal(expected))
                self.assertEqual(result.delay, max(delay, timedelta(0)))

    def test_fuel_threshold_and_missing_data(self):
        scheduled = datetime(2026, 1, 1, 10, tzinfo=timezone.utc)
        cases = [(90, 90, "0.00"), (90, 89, "20.00"), (89, 10, "0.00"), (None, 10, None), (90, None, None)]
        for departure, returned, expected in cases:
            with self.subTest(departure=departure, returned=returned):
                result = calculate_return_charges(
                    scheduled_return=scheduled,
                    actual_return=scheduled,
                    departure_fuel=departure,
                    return_fuel=returned,
                )
                self.assertEqual(result.fuel_fee, Decimal(expected) if expected is not None else None)
