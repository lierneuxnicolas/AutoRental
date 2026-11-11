from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from reservations.serializers.pricing import PriceSimulationRequestSerializer
from reservations.serializers.reservation import ReservationCreateRequestSerializer
from vehicles.serializers.public import VehicleAvailabilityQuerySerializer


class ReservationHourPrecisionValidationTests(TestCase):
    def _future_daily_period(self):
        start_date = timezone.localdate() + timedelta(days=3)
        start = timezone.make_aware(datetime.combine(start_date, time(10)))
        return start, start + timedelta(days=1)

    def test_reservation_create_rejects_non_ten_start(self):
        start, end = self._future_daily_period()
        serializer = ReservationCreateRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": (start + timedelta(minutes=30)).isoformat(),
                "end_at": (end + timedelta(minutes=30)).isoformat(),
                "insurance_type": "STANDARD",
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("start_at", serializer.errors)

    def test_reservation_create_accepts_one_day_at_ten(self):
        start, end = self._future_daily_period()
        serializer = ReservationCreateRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": start.isoformat(),
                "end_at": end.isoformat(),
                "insurance_type": "STANDARD",
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_pricing_simulation_serializer_accepts_minute_precision(self):
        start, end = self._future_daily_period()
        serializer = PriceSimulationRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": (start + timedelta(minutes=30)).isoformat(),
                "end_at": (end + timedelta(minutes=30)).isoformat(),
                "insurance_type": "STANDARD",
            },
            context={"now": timezone.now()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_vehicle_availability_rejects_non_ten_start(self):
        start, end = self._future_daily_period()
        serializer = VehicleAvailabilityQuerySerializer(
            data={
                "start": (start + timedelta(minutes=30)).isoformat(),
                "end": (end + timedelta(minutes=30)).isoformat(),
            },
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("start", serializer.errors)

    def test_vehicle_availability_accepts_one_day_at_ten(self):
        start, end = self._future_daily_period()
        serializer = VehicleAvailabilityQuerySerializer(
            data={
                "start": start.isoformat(),
                "end": end.isoformat(),
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
