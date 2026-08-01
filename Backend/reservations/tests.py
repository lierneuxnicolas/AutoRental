from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.apps import apps
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from reservations.services.pricing import PricingError, _quantize_amount, calculate_price_simulation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class PricingSimulationDataMixin:
	@classmethod
	def setUpTestData(cls):
		cls.brand = Brand.objects.create(name="Brand Sim", is_active=True)
		cls.parking = Parking.objects.create(
			name="Parking Sim",
			address="Rue Test 1",
			latitude="50.850340",
			longitude="4.351710",
			capacity=30,
			is_active=True,
		)

		cls.category_hybrid = VehicleCategory.objects.create(
			name="Hybrid",
			description="Tarif horaire + journalier",
			daily_rate=Decimal("50.00"),
			hourly_rate=Decimal("12.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		cls.category_daily_only = VehicleCategory.objects.create(
			name="Daily Only",
			description="Tarif journalier uniquement",
			daily_rate=Decimal("90.00"),
			hourly_rate=None,
			minimum_deposit=Decimal("450.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		cls.category_min_4h = VehicleCategory.objects.create(
			name="Min 4h",
			description="Duree minimale de 4h",
			daily_rate=Decimal("40.00"),
			hourly_rate=Decimal("8.00"),
			minimum_deposit=Decimal("250.00"),
			minimum_rental_hours=4,
			is_active=True,
		)
		cls.category_inactive = VehicleCategory.objects.create(
			name="Inactive Cat",
			description="Categorie inactive",
			daily_rate=Decimal("70.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("220.00"),
			minimum_rental_hours=1,
			is_active=False,
		)

		cls.space_hybrid = ParkingSpace.objects.create(parking=cls.parking, number="S1", is_active=True)
		cls.space_daily = ParkingSpace.objects.create(parking=cls.parking, number="S2", is_active=True)
		cls.space_min_4h = ParkingSpace.objects.create(parking=cls.parking, number="S3", is_active=True)
		cls.space_inactive_cat = ParkingSpace.objects.create(parking=cls.parking, number="S4", is_active=True)
		cls.space_inactive_vehicle = ParkingSpace.objects.create(parking=cls.parking, number="S5", is_active=True)

		cls.vehicle_hybrid = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category_hybrid,
			parking_space=cls.space_hybrid,
			registration_number="SIM-001",
			model_name="Model Hybrid",
			year=2024,
			color="Black",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		cls.vehicle_daily = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category_daily_only,
			parking_space=cls.space_daily,
			registration_number="SIM-002",
			model_name="Model Daily",
			year=2024,
			color="White",
			energy_type="Essence",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=2000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		cls.vehicle_min_4h = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category_min_4h,
			parking_space=cls.space_min_4h,
			registration_number="SIM-003",
			model_name="Model Min4h",
			year=2024,
			color="Grey",
			energy_type="Diesel",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=3000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		cls.vehicle_inactive_category = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category_inactive,
			parking_space=cls.space_inactive_cat,
			registration_number="SIM-004",
			model_name="Model InactiveCat",
			year=2024,
			color="Blue",
			energy_type="Electric",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=4000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		cls.vehicle_inactive = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category_hybrid,
			parking_space=cls.space_inactive_vehicle,
			registration_number="SIM-005",
			model_name="Model Inactive",
			year=2024,
			color="Red",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=5000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=False,
		)

	def _future_period(self, *, start_delta_hours=2, duration_hours=6):
		start_at = timezone.now() + timedelta(hours=start_delta_hours)
		end_at = start_at + timedelta(hours=duration_hours)
		return start_at, end_at

	def _future_period_seconds(self, *, start_delta_hours=2, duration_seconds=60):
		start_at = timezone.now() + timedelta(hours=start_delta_hours)
		end_at = start_at + timedelta(seconds=duration_seconds)
		return start_at, end_at

	def _optional_model_count(self, app_label, model_name):
		try:
			model = apps.get_model(app_label, model_name)
		except LookupError:
			return None
		if model is None:
			return None
		return model.objects.count()


class PriceSimulationServiceTests(PricingSimulationDataMixin, TestCase):
	def test_valid_vehicle_returns_expected_result(self):
		start_at, end_at = self._future_period(duration_hours=2)

		result = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(result.vehicle_id, self.vehicle_hybrid.id)
		self.assertEqual(result.duration_hours, Decimal("2.00"))
		self.assertEqual(result.rental_amount, Decimal("24.00"))
		self.assertEqual(result.deposit_amount, Decimal("300.00"))
		self.assertTrue(result.insurance_included)
		self.assertEqual(result.total_amount, Decimal("24.00"))
		self.assertEqual(result.pricing_method, "HOURLY")

	def test_vehicle_none_raises_error(self):
		start_at, end_at = self._future_period(duration_hours=2)

		with self.assertRaises(PricingError) as exc:
			calculate_price_simulation(vehicle=None, start_at=start_at, end_at=end_at)

		self.assertEqual(exc.exception.code, "VEHICLE_REQUIRED")

	def test_vehicle_absent_raises_error(self):
		start_at, end_at = self._future_period(duration_hours=2)
		missing_vehicle = type("VehicleRef", (), {"pk": 987654})()

		with self.assertRaises(PricingError) as exc:
			calculate_price_simulation(vehicle=missing_vehicle, start_at=start_at, end_at=end_at)

		self.assertEqual(exc.exception.code, "VEHICLE_NOT_FOUND")

	def test_inactive_vehicle_raises_error(self):
		start_at, end_at = self._future_period(duration_hours=3)

		with self.assertRaises(PricingError) as exc:
			calculate_price_simulation(vehicle=self.vehicle_inactive, start_at=start_at, end_at=end_at)

		self.assertEqual(exc.exception.code, "VEHICLE_NOT_ACTIVE")

	def test_inactive_category_raises_error(self):
		start_at, end_at = self._future_period(duration_hours=3)

		with self.assertRaises(PricingError) as exc:
			calculate_price_simulation(
				vehicle=self.vehicle_inactive_category,
				start_at=start_at,
				end_at=end_at,
			)

		self.assertEqual(exc.exception.code, "CATEGORY_INACTIVE")

	def test_invalid_period_raises_availability_validation_error(self):
		start_at, _ = self._future_period(duration_hours=3)
		end_at = start_at - timedelta(hours=1)

		with self.assertRaisesMessage(ValueError, "La date de fin doit etre strictement superieure"):
			calculate_price_simulation(vehicle=self.vehicle_hybrid, start_at=start_at, end_at=end_at)

	def test_duration_shorter_than_minimum_raises_error(self):
		start_at, end_at = self._future_period_seconds(duration_seconds=3599)

		with self.assertRaises(PricingError) as exc:
			calculate_price_simulation(vehicle=self.vehicle_min_4h, start_at=start_at, end_at=end_at)

		self.assertEqual(exc.exception.code, "DURATION_TOO_SHORT")

	def test_hourly_rate_used_when_it_is_cheaper(self):
		start_at, end_at = self._future_period(duration_hours=2)

		result = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(result.pricing_method, "HOURLY")
		self.assertEqual(result.rental_amount, Decimal("24.00"))

	def test_daily_rate_used_when_only_daily_rate_is_configured(self):
		start_at, end_at = self._future_period(duration_hours=6)

		result = calculate_price_simulation(
			vehicle=self.vehicle_daily,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(result.pricing_method, "DAILY")
		self.assertEqual(result.rental_amount, Decimal("90.00"))

	def test_hybrid_rule_keeps_lowest_amount(self):
		start_at, end_at = self._future_period(duration_hours=6)

		result = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		# hourly: ceil(6) * 12 = 72, daily: 1 * 50 = 50, daily must win.
		self.assertEqual(result.pricing_method, "DAILY")
		self.assertEqual(result.rental_amount, Decimal("50.00"))

	def test_monetary_rounding_helper_uses_half_up(self):
		self.assertEqual(_quantize_amount(Decimal("10.005")), Decimal("10.01"))
		self.assertEqual(_quantize_amount(Decimal("10.004")), Decimal("10.00"))

	def test_deposit_amount_comes_from_category(self):
		start_at, end_at = self._future_period(duration_hours=2)

		result = calculate_price_simulation(
			vehicle=self.vehicle_daily,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(result.deposit_amount, self.category_daily_only.minimum_deposit)

	def test_insurance_included_is_always_true(self):
		start_at, end_at = self._future_period(duration_hours=2)

		result = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertTrue(result.insurance_included)

	def test_total_amount_excludes_deposit(self):
		start_at, end_at = self._future_period(duration_hours=2)

		result = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(result.total_amount, result.rental_amount)
		self.assertNotEqual(result.total_amount, result.rental_amount + result.deposit_amount)

	def test_service_does_not_write_in_database(self):
		start_at, end_at = self._future_period(duration_hours=3)

		vehicle_count_before = Vehicle.objects.count()
		category_count_before = VehicleCategory.objects.count()
		reservation_count_before = self._optional_model_count("reservations", "Reservation")
		payment_count_before = self._optional_model_count("payments", "Payment")

		_ = calculate_price_simulation(
			vehicle=self.vehicle_hybrid,
			start_at=start_at,
			end_at=end_at,
		)

		self.assertEqual(Vehicle.objects.count(), vehicle_count_before)
		self.assertEqual(VehicleCategory.objects.count(), category_count_before)
		if reservation_count_before is not None:
			self.assertEqual(
				apps.get_model("reservations", "Reservation").objects.count(),
				reservation_count_before,
			)
		if payment_count_before is not None:
			self.assertEqual(
				apps.get_model("payments", "Payment").objects.count(),
				payment_count_before,
			)

	def test_service_uses_select_related_for_category_in_single_vehicle_query(self):
		start_at, end_at = self._future_period(duration_hours=3)

		with CaptureQueriesContext(connection) as ctx:
			result = calculate_price_simulation(
				vehicle=self.vehicle_hybrid,
				start_at=start_at,
				end_at=end_at,
			)

		self.assertEqual(result.pricing_method, "HOURLY")
		self.assertLessEqual(len(ctx), 1)
		self.assertTrue(
			any("join" in query["sql"].lower() and "vehicles_vehiclecategory" in query["sql"].lower() for query in ctx),
			msg="Le service doit charger la categorie via select_related dans la requete vehicule.",
		)


class PriceSimulationEndpointTests(PricingSimulationDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.url = reverse("reservations:price-simulation")

	def _payload(self, *, vehicle_id=None, start_at=None, end_at=None, **extra):
		start = start_at or (timezone.now() + timedelta(hours=2))
		end = end_at or (start + timedelta(hours=6))
		data = {
			"vehicle_id": vehicle_id if vehicle_id is not None else self.vehicle_hybrid.id,
			"start_at": start.isoformat(),
			"end_at": end.isoformat(),
		}
		data.update(extra)
		return data

	def test_access_without_authentication_is_allowed(self):
		response = self.client_api.post(self.url, self._payload(), format="json")
		self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_successful_simulation_returns_expected_shape(self):
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(
			set(response.data.keys()),
			{
				"vehicle_id",
				"duration_hours",
				"rental_amount",
				"deposit_amount",
				"insurance_included",
				"total_amount",
			},
		)

	def test_successful_simulation_returns_base_computed_amounts(self):
		start_at, end_at = self._future_period(duration_hours=2)

		response = self.client_api.post(
			self.url,
			self._payload(vehicle_id=self.vehicle_hybrid.id, start_at=start_at, end_at=end_at),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["vehicle_id"], self.vehicle_hybrid.id)
		self.assertEqual(Decimal(str(response.data["duration_hours"])), Decimal("2.00"))
		self.assertEqual(Decimal(str(response.data["rental_amount"])), Decimal("24.00"))
		self.assertEqual(Decimal(str(response.data["deposit_amount"])), Decimal("300.00"))
		self.assertEqual(Decimal(str(response.data["total_amount"])), Decimal("24.00"))
		self.assertTrue(response.data["insurance_included"])

	def test_unknown_vehicle_returns_404(self):
		response = self.client_api.post(self.url, self._payload(vehicle_id=999999), format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_inactive_vehicle_returns_400(self):
		response = self.client_api.post(
			self.url,
			self._payload(vehicle_id=self.vehicle_inactive.id),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_unavailable_vehicle_status_returns_400(self):
		self.vehicle_hybrid.status = Vehicle.Status.RESERVE
		self.vehicle_hybrid.save(update_fields=["status"])

		response = self.client_api.post(
			self.url,
			self._payload(vehicle_id=self.vehicle_hybrid.id),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("statut", response.data["detail"].lower())

	@patch("reservations.views.is_vehicle_available", return_value=False)
	def test_unavailable_vehicle_returns_400_and_indicative_message(self, mock_is_available):
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("indicative", response.data["detail"].lower())
		mock_is_available.assert_called_once()

	def test_missing_start_returns_400(self):
		payload = self._payload()
		payload.pop("start_at")

		response = self.client_api.post(self.url, payload, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("start_at", response.data)

	def test_missing_end_returns_400(self):
		payload = self._payload()
		payload.pop("end_at")

		response = self.client_api.post(self.url, payload, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("end_at", response.data)

	def test_end_before_start_returns_400(self):
		start = timezone.now() + timedelta(hours=8)
		end = start - timedelta(hours=1)
		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("end_at", response.data)

	def test_start_in_past_returns_400(self):
		start = timezone.now() - timedelta(hours=1)
		end = timezone.now() + timedelta(hours=2)
		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("start_at", response.data)

	def test_duration_too_short_returns_400(self):
		start = timezone.now() + timedelta(hours=2)
		end = start + timedelta(seconds=60)
		response = self.client_api.post(
			self.url,
			self._payload(vehicle_id=self.vehicle_min_4h.id, start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("duree", response.data["detail"].lower())

	@patch(
		"reservations.views.calculate_price_simulation",
		side_effect=PricingError("PRICING_NOT_CONFIGURED", "Aucun tarif n'est configure pour cette categorie."),
	)
	def test_category_without_valid_pricing_returns_400(self, mock_pricing):
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("tarif", response.data["detail"].lower())
		mock_pricing.assert_called_once()

	def test_anti_manipulation_rejects_amount_and_rate_fields(self):
		with patch("reservations.views.calculate_price_simulation") as mock_pricing:
			response = self.client_api.post(
				self.url,
				self._payload(
					rental_amount="0.01",
					deposit_amount="0.01",
					hourly_rate="0.01",
					daily_rate="0.01",
					total_amount="0.01",
				),
				format="json",
			)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("rental_amount", response.data)
		self.assertIn("deposit_amount", response.data)
		self.assertIn("hourly_rate", response.data)
		self.assertIn("daily_rate", response.data)
		self.assertIn("total_amount", response.data)
		mock_pricing.assert_not_called()

	@patch("reservations.views.is_vehicle_available", return_value=True)
	def test_endpoint_calls_availability_service(self, mock_is_available):
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		mock_is_available.assert_called_once()

	def test_endpoint_does_not_create_reservation_or_payment_and_keeps_vehicle_status(self):
		start_at, end_at = self._future_period(duration_hours=3)

		reservation_count_before = self._optional_model_count("reservations", "Reservation")
		payment_count_before = self._optional_model_count("payments", "Payment")
		original_status = self.vehicle_hybrid.status

		response = self.client_api.post(
			self.url,
			self._payload(vehicle_id=self.vehicle_hybrid.id, start_at=start_at, end_at=end_at),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)

		self.vehicle_hybrid.refresh_from_db()
		self.assertEqual(self.vehicle_hybrid.status, original_status)

		if reservation_count_before is not None:
			self.assertEqual(
				apps.get_model("reservations", "Reservation").objects.count(),
				reservation_count_before,
			)
		if payment_count_before is not None:
			self.assertEqual(
				apps.get_model("payments", "Payment").objects.count(),
				payment_count_before,
			)

	def test_endpoint_uses_select_related_for_category_without_n_plus_one(self):
		with CaptureQueriesContext(connection) as ctx:
			response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertLessEqual(len(ctx), 4)
		self.assertTrue(
			any("join" in query["sql"].lower() and "vehicles_vehiclecategory" in query["sql"].lower() for query in ctx),
			msg="La requete vehicule doit inclure la categorie via JOIN (select_related).",
		)
