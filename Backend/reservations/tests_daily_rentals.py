from datetime import datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ClientDocument
from payments.models import Deposit, Payment
from reservations.models import Reservation
from reservations.services.pricing import calculate_price_simulation
from reservations.tests import PricingSimulationDataMixin, ReservationTestDataMixin
from vehicles.serializers.public import VehicleAvailabilityQuerySerializer
from vehicles.services import AvailabilityValidationError, validate_daily_rental_period


def future_daily_period(days: int = 1, start_offset_days: int = 3):
    start_date = timezone.localdate() + timedelta(days=start_offset_days)
    start_at = timezone.make_aware(datetime.combine(start_date, time(10)))
    return start_at, start_at + timedelta(days=days)


class DailyRentalPricingTests(PricingSimulationDataMixin, TestCase):
    def test_one_day_uses_daily_vehicle_rate(self):
        start_at, end_at = future_daily_period()

        result = calculate_price_simulation(
            vehicle=self.vehicle_hybrid,
            start_at=start_at,
            end_at=end_at,
            is_daily_rate_booking=True,
        )

        self.assertEqual(result.billed_days, 1)
        self.assertEqual(result.duration_hours, Decimal("24.00"))
        self.assertEqual(result.rental_amount, Decimal("50.00"))

    def test_three_days_and_insurance_use_three_daily_rates(self):
        start_at, end_at = future_daily_period(days=3)

        result = calculate_price_simulation(
            vehicle=self.vehicle_hybrid,
            start_at=start_at,
            end_at=end_at,
            insurance_type="DUO",
            is_daily_rate_booking=True,
        )

        self.assertEqual(result.billed_days, 3)
        self.assertEqual(result.rental_amount, Decimal("150.00"))
        self.assertEqual(result.insurance_amount, Decimal("24.00"))
        self.assertEqual(result.total_amount, Decimal("174.00"))

    def test_legacy_reservation_pricing_keeps_hourly_rule(self):
        start_at = future_daily_period()[0]

        result = calculate_price_simulation(
            vehicle=self.vehicle_hybrid,
            start_at=start_at,
            end_at=start_at + timedelta(hours=2),
        )

        self.assertEqual(result.rental_amount, Decimal("24.00"))
        self.assertEqual(result.pricing_method, "HOURLY")


class DailyRentalValidationTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(self.client_user_1)

    def _payload(self, *, start_at, end_at):
        return {
            "vehicle_id": self.vehicle_available.id,
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
            "insurance_type": Reservation.InsuranceType.STANDARD,
        }

    def test_reservation_create_accepts_one_and_three_days(self):
        for start_offset_days, days in ((3, 1), (6, 3)):
            start_at, end_at = future_daily_period(days=days, start_offset_days=start_offset_days)
            response = self.api.post(
                "/api/v1/reservations/",
                self._payload(start_at=start_at, end_at=end_at),
                format="json",
            )

            self.assertEqual(response.status_code, 201, response.data)
            reservation = Reservation.objects.get(pk=response.data["id"])
            self.assertTrue(reservation.is_daily_rate_booking)
            self.assertEqual(reservation.rental_amount, Decimal("100.00") * days)

    def test_reservation_create_rejects_non_ten_o_clock_start(self):
        start_at, end_at = future_daily_period()
        start_at += timedelta(hours=1)
        end_at += timedelta(hours=1)

        response = self.api.post(
            "/api/v1/reservations/",
            self._payload(start_at=start_at, end_at=end_at),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("start_at", response.data)

    def test_reservation_create_rejects_same_day_return(self):
        start_at, _ = future_daily_period()

        response = self.api.post(
            "/api/v1/reservations/",
            self._payload(start_at=start_at, end_at=start_at + timedelta(hours=23)),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_at", response.data)

    def test_reservation_create_rejects_overlapping_booking(self):
        start_at, end_at = future_daily_period()
        Reservation.objects.create(
            client=self.client_profile_2,
            vehicle=self.vehicle_available,
            start_at=start_at,
            end_at=end_at,
            status=Reservation.Status.CONFIRMEE,
            rental_amount=Decimal("100.00"),
            deposit_amount=Decimal("500.00"),
            confirmed_at=timezone.now(),
        )

        response = self.api.post(
            "/api/v1/reservations/",
            self._payload(start_at=start_at, end_at=end_at),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "VEHICLE_UNAVAILABLE")

    def test_availability_query_enforces_fixed_hour_and_one_day_minimum(self):
        start_at, end_at = future_daily_period()
        serializer = VehicleAvailabilityQuerySerializer(
            data={"start": start_at.isoformat(), "end": end_at.isoformat()}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["billed_days"], 1)

        serializer = VehicleAvailabilityQuerySerializer(
            data={
                "start": start_at.isoformat(),
                "end": (start_at + timedelta(days=1, hours=1)).isoformat(),
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("end", serializer.errors)


def at_local(date_value, hour, minute=0):
    return timezone.make_aware(datetime.combine(date_value, time(hour, minute)))


class SameDayRentalValidationTests(ReservationTestDataMixin, TestCase):
    today = timezone.localdate() + timedelta(days=1)

    def test_simulation_and_creation_accept_same_day_minutes(self):
        now = at_local(self.today, 19, 38)
        start_at = at_local(self.today, 19, 50)
        api = APIClient()
        api.force_authenticate(self.client_user_1)
        for days, insurance, insurance_amount in (
            (1, "STANDARD", "0.00"),
            (1, "COMPLEMENTAIRE", "10.00"),
            (2, "STANDARD", "0.00"),
            (2, "COMPLEMENTAIRE", "20.00"),
        ):
            payload = {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": at_local(self.today + timedelta(days=days), 10).isoformat(),
                "insurance_type": insurance,
            }
            with self.subTest(days=days, insurance=insurance), patch(
                "django.utils.timezone.now", return_value=now
            ):
                response = api.post("/api/v1/simulations/", payload, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(Decimal(response.data["rental_amount"]), Decimal("100.00") * days)
                self.assertEqual(Decimal(response.data["insurance_amount"]), Decimal(insurance_amount))
                self.assertEqual(
                    Decimal(response.data["total_amount"]),
                    Decimal("100.00") * days + Decimal(insurance_amount),
                )

        with patch("django.utils.timezone.now", return_value=now):
            payload["insurance_type"] = "STANDARD"
            response = api.post("/api/v1/reservations/", payload, format="json")
            self.assertEqual(response.status_code, 201, response.data)

    def test_simulation_rejects_incorrect_return_clock(self):
        now = at_local(self.today, 19, 38)
        start_at = at_local(self.today, 19, 50)
        with patch("django.utils.timezone.now", return_value=now):
            response = APIClient().post(
                "/api/v1/simulations/",
                {
                    "vehicle_id": self.vehicle_available.id,
                    "start_at": start_at.isoformat(),
                    "end_at": (start_at + timedelta(days=1, minutes=5)).isoformat(),
                    "insurance_type": "STANDARD",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["code"], "END_NOT_AT_FIXED_HOUR")

    def test_same_day_simulation_creation_and_payment_intent_reuse(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        license_document.save(update_fields=["driving_license_transmission"])
        self.vehicle_available.transmission = "Automatique"
        self.vehicle_available.save(update_fields=["transmission"])
        now = at_local(self.today, 19, 38)
        start_at = at_local(self.today, 19, 50)
        payload = {
            "vehicle_id": self.vehicle_available.id,
            "start_at": start_at.isoformat(),
            "end_at": at_local(self.today + timedelta(days=2), 10).isoformat(),
            "insurance_type": "COMPLEMENTAIRE",
        }
        api = APIClient()
        api.force_authenticate(self.client_user_1)
        stripe_intent = SimpleNamespace(
            id="pi_test_same_day",
            status="requires_payment_method",
            client_secret="test_secret",
            payment_method_types=["card", "bancontact"],
        )
        with patch("django.utils.timezone.now", return_value=now), self.settings(
            STRIPE_SECRET_KEY="sk_test_example"
        ), patch(
            "payments.services.payment_intents.stripe.PaymentIntent.create", return_value=stripe_intent
        ) as create_intent, patch(
            "payments.services.payment_intents.stripe.PaymentIntent.retrieve", return_value=stripe_intent
        ):
            simulation = api.post("/api/v1/simulations/", payload, format="json")
            self.assertEqual(simulation.status_code, 200, simulation.data)
            creation = api.post("/api/v1/reservations/", payload, format="json")
            self.assertEqual(creation.status_code, 201, creation.data)
            reservation = Reservation.objects.get(pk=creation.data["id"])
            Deposit.objects.create(
                reservation=reservation,
                mode=Deposit.Mode.SIMULATED,
                amount=reservation.deposit_amount,
                currency="EUR",
                status=Deposit.Status.AUTORISEE,
                authorized_at=now,
            )
            resumed_simulation = api.post(
                "/api/v1/simulations/", {**payload, "reservation_id": reservation.id}, format="json"
            )
            self.assertEqual(resumed_simulation.status_code, 200, resumed_simulation.data)
            url = f"/api/v1/reservations/{reservation.id}/payment-intent/"
            first = api.post(url, {}, format="json")
            second = api.post(url, {}, format="json")
            self.assertEqual(first.status_code, 200, first.data)
            self.assertEqual(second.status_code, 200, second.data)
            self.assertEqual(first.data["payment_id"], second.data["payment_id"])
            self.assertEqual(Payment.objects.filter(reservation=reservation).count(), 1)
            self.assertEqual(create_intent.call_count, 1)
            self.assertEqual(create_intent.call_args.kwargs["amount"], 22000)

    def _validate(self, now, start_at, end_at):
        with patch("django.utils.timezone.now", return_value=now):
            return validate_daily_rental_period(start=start_at, end=end_at)

    def _code(self, now, start_at, end_at):
        with self.assertRaises(AvailabilityValidationError) as context:
            self._validate(now, start_at, end_at)
        return context.exception.code

    def test_before_ten_same_day_start_must_stay_at_ten(self):
        now = at_local(self.today, 8, 0)
        period = self._validate(now, at_local(self.today, 10), at_local(self.today + timedelta(days=1), 10))
        self.assertEqual(period["billed_days"], 1)
        self.assertEqual(
            self._code(now, at_local(self.today, 9, 0), at_local(self.today + timedelta(days=1), 9, 0)),
            "START_NOT_AT_FIXED_HOUR",
        )

    def test_after_ten_same_day_start_returns_at_ten(self):
        now = at_local(self.today, 14, 7)
        start_at = at_local(self.today, 14, 20)
        period = self._validate(now, start_at, at_local(self.today + timedelta(days=2), 10))
        self.assertEqual(period["billed_days"], 2)
        self.assertEqual(period["duration_hours"], 43 + 40 / 60)

    def test_after_ten_same_day_start_in_the_past_is_rejected(self):
        now = at_local(self.today, 14, 7)
        self.assertEqual(
            self._code(now, at_local(self.today, 10), at_local(self.today + timedelta(days=1), 10)),
            "START_IN_PAST",
        )
        self.assertEqual(
            self._code(now, at_local(self.today, 14, 0), at_local(self.today + timedelta(days=1), 14, 0)),
            "START_IN_PAST",
        )

    def test_after_ten_return_must_be_at_ten(self):
        now = at_local(self.today, 14, 7)
        start_at = at_local(self.today, 14, 20)
        self.assertEqual(self._code(now, start_at, start_at + timedelta(hours=23)), "END_NOT_AT_FIXED_HOUR")
        self.assertEqual(
            self._code(now, start_at, start_at + timedelta(days=1, minutes=5)),
            "END_NOT_AT_FIXED_HOUR",
        )

    def test_late_at_23h_bills_one_two_and_three_calendar_days(self):
        now = at_local(self.today, 22, 55)
        start = at_local(self.today, 23)
        with patch("django.utils.timezone.now", return_value=now):
            for days in (1, 2, 3):
                with self.subTest(days=days):
                    end = at_local(self.today + timedelta(days=days), 10)
                    result = calculate_price_simulation(
                        vehicle=self.vehicle_available, start_at=start, end_at=end,
                        is_daily_rate_booking=True,
                    )
                    self.assertEqual(result.billed_days, days)
                    self.assertEqual(result.rental_amount, Decimal("100.00") * days)
                    self.assertEqual(result.duration_hours, Decimal(11 + (days - 1) * 24))

    def test_late_at_23h_simulation_and_reservation(self):
        now = at_local(self.today, 22, 55)
        start = at_local(self.today, 23)
        end = at_local(self.today + timedelta(days=1), 10)
        api = APIClient()
        api.force_authenticate(self.client_user_1)
        payload = {"vehicle_id": self.vehicle_available.id, "start_at": start.isoformat(), "end_at": end.isoformat()}
        with patch("django.utils.timezone.now", return_value=now):
            simulation = api.post("/api/v1/simulations/", payload, format="json")
            self.assertEqual(simulation.status_code, 200, simulation.data)
            self.assertEqual(Decimal(simulation.data["total_amount"]), Decimal("100.00"))
            self.assertEqual(Decimal(simulation.data["duration_hours"]), Decimal("11.00"))
            created = api.post("/api/v1/reservations/", payload, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            reservation = Reservation.objects.get(pk=created.data["id"])
            self.assertEqual(reservation.end_at, end)
            self.assertEqual(reservation.rental_amount, Decimal("100.00"))

    def test_last_minute_start_may_include_seconds(self):
        now = at_local(self.today, 23, 59) + timedelta(seconds=30)
        start = at_local(self.today, 23, 59) + timedelta(seconds=40)
        period = self._validate(now, start, at_local(self.today + timedelta(days=1), 10))
        self.assertEqual(period["billed_days"], 1)

    def test_past_return_rejected(self):
        now = at_local(self.today, 23)
        self.assertEqual(
            self._code(now, at_local(self.today - timedelta(days=1), 10), at_local(self.today, 10)),
            "START_IN_PAST",
        )

    def test_summer_time_change_bills_calendar_day_with_actual_duration(self):
        start = at_local(datetime(2030, 3, 30).date(), 10)
        end = at_local(datetime(2030, 3, 31).date(), 10)
        now = at_local(datetime(2030, 3, 29).date(), 9)
        with patch("django.utils.timezone.now", return_value=now):
            result = calculate_price_simulation(
                vehicle=self.vehicle_available, start_at=start, end_at=end, is_daily_rate_booking=True,
            )
        self.assertEqual(result.billed_days, 1)
        self.assertEqual(result.duration_hours, Decimal("23.00"))

    def test_late_booking_checks_actual_overlap_and_adjacent_period(self):
        now = at_local(self.today, 22, 55)
        start = at_local(self.today, 23)
        end = at_local(self.today + timedelta(days=1), 10)
        self._create_reservation(
            client=self.client_profile_2, status=Reservation.Status.CONFIRMEE,
            start_at=start - timedelta(hours=1), end_at=end,
        )
        api = APIClient()
        api.force_authenticate(self.client_user_1)
        with patch("django.utils.timezone.now", return_value=now):
            response = api.post("/api/v1/reservations/", {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start.isoformat(), "end_at": end.isoformat(),
            }, format="json")
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(response.data["code"], "VEHICLE_UNAVAILABLE")
            next_day = api.post("/api/v1/reservations/", {
                "vehicle_id": self.vehicle_available.id,
                "start_at": end.isoformat(),
                "end_at": at_local(self.today + timedelta(days=2), 10).isoformat(),
            }, format="json")
            self.assertEqual(next_day.status_code, 201, next_day.data)

    def test_existing_daily_period_keeps_old_return_clock_when_priced(self):
        now = at_local(self.today, 19, 38)
        start = at_local(self.today, 19, 50)
        with patch("django.utils.timezone.now", return_value=now):
            result = calculate_price_simulation(
                vehicle=self.vehicle_available, start_at=start, end_at=start + timedelta(days=2),
                is_daily_rate_booking=True,
            )
        self.assertEqual(result.rental_amount, Decimal("200.00"))

    def test_custom_time_is_rejected_for_other_days(self):
        now = at_local(self.today, 14, 7)
        tomorrow = self.today + timedelta(days=1)
        self.assertEqual(
            self._code(now, at_local(tomorrow, 14, 20), at_local(tomorrow + timedelta(days=1), 14, 20)),
            "START_NOT_AT_FIXED_HOUR",
        )
        period = self._validate(now, at_local(tomorrow, 10), at_local(tomorrow + timedelta(days=3), 10))
        self.assertEqual(period["billed_days"], 3)

    def test_invalid_dates_are_rejected(self):
        now = at_local(self.today, 14, 7)
        with self.assertRaises(AvailabilityValidationError):
            self._validate(now, "not-a-date", at_local(self.today + timedelta(days=1), 10))
        self.assertEqual(
            self._code(now, at_local(self.today + timedelta(days=2), 10), at_local(self.today + timedelta(days=1), 10)),
            "END_BEFORE_START",
        )
