from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from reservations.serializers.pricing import PriceSimulationRequestSerializer
from reservations.serializers.reservation import ReservationCreateRequestSerializer
from vehicles.serializers.public import VehicleAvailabilityQuerySerializer


class ReservationHourPrecisionValidationTests(TestCase):
    def _future_hour(self, hours_offset: int):
        value = timezone.now() + timedelta(hours=hours_offset)
        return value.replace(minute=0, second=0, microsecond=0)

    def _future_half_hour(self, hours_offset: int) -> timezone.datetime:
        value = self._future_hour(hours_offset)
        return value.replace(minute=30)

    def test_reservation_create_rejects_half_hour(self):
        serializer = ReservationCreateRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": self._future_half_hour(2).isoformat(),
                "end_at": self._future_hour(4).isoformat(),
                "insurance_type": "STANDARD",
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("start_at", serializer.errors)
        self.assertIn("minutes = 00", str(serializer.errors["start_at"][0]))

    def test_reservation_create_accepts_full_hour_values(self):
        serializer = ReservationCreateRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": self._future_hour(2).isoformat(),
                "end_at": self._future_hour(7).isoformat(),
                "insurance_type": "STANDARD",
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_pricing_simulation_rejects_half_hour(self):
        serializer = PriceSimulationRequestSerializer(
            data={
                "vehicle_id": 1,
                "start_at": self._future_hour(3).isoformat(),
                "end_at": self._future_half_hour(6).isoformat(),
                "insurance_type": "STANDARD",
            },
            context={"now": timezone.now()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("end_at", serializer.errors)
        self.assertIn("minutes = 00", str(serializer.errors["end_at"][0]))

    def test_vehicle_availability_rejects_half_hour(self):
        serializer = VehicleAvailabilityQuerySerializer(
            data={
                "start": self._future_half_hour(2).isoformat(),
                "end": self._future_hour(5).isoformat(),
            },
            context={"minimum_hours": 1},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("start", serializer.errors)
        self.assertIn("minutes = 00", str(serializer.errors["start"][0]))

    def test_vehicle_availability_accepts_full_hours_including_night_hours(self):
        today = timezone.localtime(timezone.now()).date()
        start = timezone.make_aware(datetime.combine(today + timedelta(days=1), time.min)).replace(hour=23)
        end = start + timedelta(hours=6)

        serializer = VehicleAvailabilityQuerySerializer(
            data={
                "start": start.isoformat(),
                "end": end.isoformat(),
            },
            context={"minimum_hours": 1},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
