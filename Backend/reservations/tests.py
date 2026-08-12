import inspect
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import resolve, reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile, Role
from accounts.tests.utils import create_user, ensure_roles
from inspections.models import Inspection
from interventions.models import Intervention, LockingLog, VehicleAccess
from interventions.services.vehicle_access import activate_vehicle_access
from notifications.models import Notification
from payments.models import Deposit, Payment
from reservations.models import Reservation
from reservations.services.pricing import PricingError, _quantize_amount, calculate_price_simulation
from reservations.services.reminders import REMINDER_NOTIFICATION_TYPE, send_reservation_24h_reminders
from reservations.services.reservation_creation import create_draft_reservation
from reservations.views import (
	PriceSimulationView,
	ReservationClientCancelView,
	ReservationClientDepositAuthorizeView,
	ReservationClientDetailView,
	ReservationClientListCreateView,
	ReservationClientPaymentIntentView,
	ReservationManagementCompleteView,
	ReservationManagementDetailView,
	ReservationManagementListView,
	ReservationLockView,
	ReservationUnlockView,
)
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

	@patch("reservations.views.pricing.is_vehicle_available", return_value=False)
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
		"reservations.views.pricing.calculate_price_simulation",
		side_effect=PricingError("PRICING_NOT_CONFIGURED", "Aucun tarif n'est configure pour cette categorie."),
	)
	def test_category_without_valid_pricing_returns_400(self, mock_pricing):
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("tarif", response.data["detail"].lower())
		mock_pricing.assert_called_once()

	def test_anti_manipulation_rejects_amount_and_rate_fields(self):
		with patch("reservations.views.pricing.calculate_price_simulation") as mock_pricing:
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

	@patch("reservations.views.pricing.is_vehicle_available", return_value=True)
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


def _doc_file(name):
	return SimpleUploadedFile(name, b"document", content_type="application/octet-stream")


class ReservationTestDataMixin:
	@classmethod
	def setUpTestData(cls):
		User = get_user_model()

		cls.role_client = Role.objects.create(code=Role.Code.CLIENT, label="Client")
		cls.role_manager = Role.objects.create(code=Role.Code.GESTIONNAIRE_COMPTABLE, label="Gestionnaire")
		cls.role_admin = Role.objects.create(code=Role.Code.ADMINISTRATEUR, label="Administrateur")
		cls.role_mechanic = Role.objects.create(code=Role.Code.MECANICIEN, label="Mecanicien")
		cls.role_cleaner = Role.objects.create(code=Role.Code.NETTOYEUR, label="Nettoyeur")

		cls.client_user_1 = User.objects.create_user(
			email="client1@example.com",
			password="Pass1234!",
			first_name="Alice",
			last_name="Client",
			phone="0400000001",
			role=cls.role_client,
			email_verified=True,
		)
		cls.client_user_2 = User.objects.create_user(
			email="client2@example.com",
			password="Pass1234!",
			first_name="Bob",
			last_name="Client",
			phone="0400000002",
			role=cls.role_client,
			email_verified=True,
		)
		cls.manager_user = User.objects.create_user(
			email="manager.reservation@example.com",
			password="Pass1234!",
			first_name="Mina",
			last_name="Manager",
			phone="0400000003",
			role=cls.role_manager,
			email_verified=True,
		)
		cls.admin_user = User.objects.create_user(
			email="admin.reservation@example.com",
			password="Pass1234!",
			first_name="Adam",
			last_name="Admin",
			phone="0400000004",
			role=cls.role_admin,
			email_verified=True,
		)
		cls.mechanic_user = User.objects.create_user(
			email="mechanic.reservation@example.com",
			password="Pass1234!",
			first_name="Max",
			last_name="Mechanic",
			phone="0400000005",
			role=cls.role_mechanic,
			email_verified=True,
		)
		cls.cleaner_user = User.objects.create_user(
			email="cleaner.reservation@example.com",
			password="Pass1234!",
			first_name="Nina",
			last_name="Cleaner",
			phone="0400000006",
			role=cls.role_cleaner,
			email_verified=True,
		)

		adult_birthdate = timezone.localdate() - timedelta(days=25 * 365)
		cls.client_profile_1 = ClientProfile.objects.create(
			user=cls.client_user_1,
			date_of_birth=adult_birthdate,
			address="Rue de la Reservation 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		cls.client_profile_2 = ClientProfile.objects.create(
			user=cls.client_user_2,
			date_of_birth=adult_birthdate,
			address="Rue de la Reservation 2",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)

		cls.brand = Brand.objects.create(name="Brand Reservation", is_active=True)
		cls.category = VehicleCategory.objects.create(
			name="Category Reservation",
			description="Categorie test reservation",
			daily_rate=Decimal("100.00"),
			hourly_rate=Decimal("20.00"),
			minimum_deposit=Decimal("350.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		cls.parking = Parking.objects.create(
			name="Parking Reservation",
			address="Rue Parking 1",
			latitude="50.850340",
			longitude="4.351710",
			capacity=30,
			is_active=True,
		)
		cls.space_1 = ParkingSpace.objects.create(parking=cls.parking, number="R1", is_active=True)
		cls.space_2 = ParkingSpace.objects.create(parking=cls.parking, number="R2", is_active=True)
		cls.space_3 = ParkingSpace.objects.create(parking=cls.parking, number="R3", is_active=True)

		cls.vehicle_available = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_1,
			registration_number="RSV-001",
			model_name="Model A",
			year=2024,
			color="Black",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1500,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		cls.vehicle_reserved = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_2,
			registration_number="RSV-002",
			model_name="Model B",
			year=2024,
			color="White",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1700,
			status=Vehicle.Status.RESERVE,
			is_active=True,
		)
		cls.vehicle_inactive = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_3,
			registration_number="RSV-003",
			model_name="Model C",
			year=2023,
			color="Blue",
			energy_type="Diesel",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=5000,
			status=Vehicle.Status.DISPONIBLE,
			is_active=False,
		)

		cls._create_valid_documents(cls.client_profile_1, suffix="1")
		cls._create_valid_documents(cls.client_profile_2, suffix="2")

	@classmethod
	def _create_valid_documents(cls, profile, *, suffix="x"):
		expiration = timezone.localdate() + timedelta(days=365)
		ClientDocument.objects.create(
			client=profile,
			document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
			document_number=f"ID-{suffix}",
			file=_doc_file(f"id-{suffix}.bin"),
			expiration_date=expiration,
			status=ClientDocument.Status.VALIDE,
			is_active=True,
		)
		ClientDocument.objects.create(
			client=profile,
			document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
			document_number=f"LIC-{suffix}",
			file=_doc_file(f"license-{suffix}.bin"),
			expiration_date=expiration,
			status=ClientDocument.Status.VALIDE,
			is_active=True,
		)

	def _period(self, *, start_hours=6, duration_hours=4):
		start_at = timezone.now() + timedelta(hours=start_hours)
		end_at = start_at + timedelta(hours=duration_hours)
		return start_at, end_at

	def _optional_model_count(self, app_label, model_name):
		try:
			model = apps.get_model(app_label, model_name)
		except LookupError:
			return None
		if model is None:
			return None
		return model.objects.count()

	def _create_reservation(self, *, client=None, vehicle=None, status=Reservation.Status.BROUILLON, start_at=None, end_at=None):
		start, end = (start_at, end_at) if start_at and end_at else self._period()
		confirmed_at = start if status in Reservation.CONFIRMED_STATUSES else None
		cancelled_at = timezone.now() if status == Reservation.Status.ANNULEE else None
		cancellation_reason = "Annulee" if status == Reservation.Status.ANNULEE else ""
		return Reservation.objects.create(
			client=client or self.client_profile_1,
			vehicle=vehicle or self.vehicle_available,
			start_at=start,
			end_at=end,
			status=status,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("350.00"),
			confirmed_at=confirmed_at,
			cancelled_at=cancelled_at,
			cancellation_reason=cancellation_reason,
		)


class ReservationRoutingTests(TestCase):
	def test_client_urls_are_configured_and_cancel_route_is_resolved(self):
		self.assertEqual(reverse("reservations:reservation-list-create"), "/api/v1/reservations/")
		self.assertEqual(reverse("reservations:reservation-detail", kwargs={"pk": 1}), "/api/v1/reservations/1/")
		self.assertEqual(reverse("reservations:reservation-deposit-authorize", kwargs={"pk": 1}), "/api/v1/reservations/1/deposit/")
		self.assertEqual(reverse("reservations:reservation-payment-intent", kwargs={"pk": 1}), "/api/v1/reservations/1/payment-intent/")
		self.assertEqual(reverse("reservations:reservation-cancel", kwargs={"pk": 1}), "/api/v1/reservations/1/cancel/")
		self.assertEqual(reverse("reservations:reservation-unlock", kwargs={"pk": 1}), "/api/v1/reservations/1/unlock/")
		self.assertEqual(reverse("reservations:reservation-lock", kwargs={"pk": 1}), "/api/v1/reservations/1/lock/")

		self.assertIs(resolve("/api/v1/reservations/").func.view_class, ReservationClientListCreateView)
		self.assertIs(resolve("/api/v1/reservations/1/").func.view_class, ReservationClientDetailView)
		self.assertIs(resolve("/api/v1/reservations/1/deposit/").func.view_class, ReservationClientDepositAuthorizeView)
		self.assertIs(resolve("/api/v1/reservations/1/payment-intent/").func.view_class, ReservationClientPaymentIntentView)
		self.assertIs(resolve("/api/v1/reservations/1/cancel/").func.view_class, ReservationClientCancelView)
		self.assertIs(resolve("/api/v1/reservations/1/unlock/").func.view_class, ReservationUnlockView)
		self.assertIs(resolve("/api/v1/reservations/1/lock/").func.view_class, ReservationLockView)

	def test_management_urls_are_configured(self):
		self.assertEqual(reverse("reservations:management-reservation-list"), "/api/v1/management/reservations/")
		self.assertEqual(
			reverse("reservations:management-reservation-detail", kwargs={"pk": 1}),
			"/api/v1/management/reservations/1/",
		)
		self.assertEqual(
			reverse("reservations:management-reservation-complete", kwargs={"pk": 1}),
			"/api/v1/management/reservations/1/complete/",
		)

		self.assertIs(resolve("/api/v1/management/reservations/").func.view_class, ReservationManagementListView)
		self.assertIs(resolve("/api/v1/management/reservations/1/").func.view_class, ReservationManagementDetailView)
		self.assertIs(resolve("/api/v1/management/reservations/1/complete/").func.view_class, ReservationManagementCompleteView)

	def test_simulation_endpoint_is_not_broken(self):
		self.assertEqual(reverse("reservations:price-simulation"), "/api/v1/simulations/")
		self.assertIs(resolve("/api/v1/simulations/").func.view_class, PriceSimulationView)


class ReservationModelTests(ReservationTestDataMixin, TestCase):
	def test_reference_is_generated_automatically(self):
		reservation = self._create_reservation()
		self.assertTrue(reservation.reference.startswith(f"AR-{timezone.localdate().year}-"))

	@patch("reservations.models.Reservation.generate_reference", return_value="AR-2099-DUPL0001")
	def test_reference_must_be_unique(self, _mock_reference):
		self._create_reservation()
		with self.assertRaises(ValidationError):
			self._create_reservation(
				vehicle=self.vehicle_reserved,
				start_at=timezone.now() + timedelta(days=2),
				end_at=timezone.now() + timedelta(days=2, hours=3),
			)

	def test_status_choices_are_exact(self):
		expected = {
			"BROUILLON",
			"EN_ATTENTE_CAUTION",
			"EN_ATTENTE_PAIEMENT",
			"CONFIRMEE",
			"EN_COURS",
			"A_CONTROLER",
			"TERMINEE",
			"ANNULEE",
			"PAIEMENT_ECHOUE",
		}
		self.assertEqual({value for value, _ in Reservation.Status.choices}, expected)

	def test_end_at_must_be_after_start_at(self):
		start = timezone.now() + timedelta(hours=5)
		with self.assertRaises(ValidationError):
			Reservation.objects.create(
				client=self.client_profile_1,
				vehicle=self.vehicle_available,
				start_at=start,
				end_at=start,
				status=Reservation.Status.BROUILLON,
				rental_amount=Decimal("10.00"),
				deposit_amount=Decimal("10.00"),
			)

	def test_amounts_must_be_non_negative(self):
		start, end = self._period()
		with self.assertRaises(ValidationError):
			Reservation.objects.create(
				client=self.client_profile_1,
				vehicle=self.vehicle_available,
				start_at=start,
				end_at=end,
				status=Reservation.Status.BROUILLON,
				rental_amount=Decimal("-1.00"),
				deposit_amount=Decimal("10.00"),
			)

		with self.assertRaises(ValidationError):
			Reservation.objects.create(
				client=self.client_profile_1,
				vehicle=self.vehicle_available,
				start_at=start,
				end_at=end,
				status=Reservation.Status.BROUILLON,
				rental_amount=Decimal("10.00"),
				deposit_amount=Decimal("-1.00"),
			)

	def test_cancellation_fields_consistency(self):
		start, end = self._period()

		with self.assertRaises(ValidationError):
			Reservation.objects.create(
				client=self.client_profile_1,
				vehicle=self.vehicle_available,
				start_at=start,
				end_at=end,
				status=Reservation.Status.ANNULEE,
				rental_amount=Decimal("10.00"),
				deposit_amount=Decimal("10.00"),
				cancelled_at=None,
				cancellation_reason="",
			)

		with self.assertRaises(ValidationError):
			Reservation.objects.create(
				client=self.client_profile_1,
				vehicle=self.vehicle_available,
				start_at=start,
				end_at=end,
				status=Reservation.Status.BROUILLON,
				rental_amount=Decimal("10.00"),
				deposit_amount=Decimal("10.00"),
				cancelled_at=timezone.now(),
			)

	def test_str_returns_reference(self):
		reservation = self._create_reservation()
		self.assertEqual(str(reservation), reservation.reference)


class ReservationCreationEndpointTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.url = reverse("reservations:reservation-list-create")

	def _payload(self, *, vehicle_id=None, start_at=None, end_at=None, **extra):
		start, end = (start_at, end_at) if start_at and end_at else self._period()
		data = {
			"vehicle_id": vehicle_id if vehicle_id is not None else self.vehicle_available.id,
			"start_at": start.isoformat(),
			"end_at": end.isoformat(),
		}
		data.update(extra)
		return data

	def test_client_authentifie_valide_cree_un_brouillon(self):
		self.client_api.force_authenticate(self.client_user_1)
		notif_before = Notification.objects.count()
		payment_before = self._optional_model_count("payments", "Payment")
		vehicle_status_before = self.vehicle_available.status

		with self.captureOnCommitCallbacks(execute=True):
			response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		reservation = Reservation.objects.get(pk=response.data["id"])
		self.assertEqual(reservation.status, Reservation.Status.BROUILLON)
		self.assertTrue(reservation.reference)
		self.assertEqual(Notification.objects.count(), notif_before + 1)
		self.assertTrue(
			Notification.objects.filter(
				notification_type="RESERVATION_DRAFT_CREATED",
				title="Reservation creee",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).exists()
		)
		self.vehicle_available.refresh_from_db()
		self.assertEqual(self.vehicle_available.status, vehicle_status_before)
		if payment_before is not None:
			self.assertEqual(apps.get_model("payments", "Payment").objects.count(), payment_before)

	def test_role_non_client_refuse(self):
		self.client_api.force_authenticate(self.manager_user)
		response = self.client_api.post(self.url, self._payload(), format="json")
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_client_sans_profil_refuse(self):
		User = get_user_model()
		user_without_profile = User.objects.create_user(
			email="no-profile@example.com",
			password="Pass1234!",
			first_name="No",
			last_name="Profile",
			phone="0400000099",
			role=self.role_client,
			email_verified=True,
		)
		self.client_api.force_authenticate(user_without_profile)
		response = self.client_api.post(self.url, self._payload(), format="json")
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_email_non_confirme_refuse(self):
		self.client_user_1.email_verified = False
		self.client_user_1.save(update_fields=["email_verified"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
		self.assertIn("EMAIL_NOT_VERIFIED", response.data.get("details", {}).get("eligibility_errors", []))

	def test_profil_incomplet_refuse(self):
		self.client_user_1.phone = ""
		self.client_user_1.save(update_fields=["phone"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
		self.assertIn("PROFILE_INCOMPLETE", response.data.get("details", {}).get("eligibility_errors", []))

	def test_profil_refuse_refuse(self):
		self.client_profile_1.profile_status = ClientProfile.ProfileStatus.REFUSE
		self.client_profile_1.save(update_fields=["profile_status"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
		self.assertIn("PROFILE_NOT_VALID", response.data.get("details", {}).get("eligibility_errors", []))

	def test_moins_de_21_ans_refuse(self):
		self.client_profile_1.date_of_birth = timezone.localdate() - timedelta(days=20 * 365)
		self.client_profile_1.save(update_fields=["date_of_birth"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("UNDER_MINIMUM_AGE", response.data.get("details", {}).get("eligibility_errors", []))

	def test_carte_absente_refuse(self):
		ClientDocument.objects.filter(
			client=self.client_profile_1,
			document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
			is_active=True,
		).delete()
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("IDENTITY_CARD_MISSING", response.data.get("details", {}).get("eligibility_errors", []))

	def test_permis_absent_refuse(self):
		ClientDocument.objects.filter(
			client=self.client_profile_1,
			document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
			is_active=True,
		).delete()
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("DRIVING_LICENSE_MISSING", response.data.get("details", {}).get("eligibility_errors", []))

	def test_carte_expiree_avant_fin_refuse(self):
		start, end = self._period()
		card = ClientDocument.objects.filter(
			client=self.client_profile_1,
			document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
			is_active=True,
		).first()
		card.expiration_date = end.date() - timedelta(days=1)
		card.save(update_fields=["expiration_date"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("IDENTITY_CARD_EXPIRES_TOO_SOON", response.data.get("details", {}).get("eligibility_errors", []))

	def test_permis_expire_avant_fin_refuse(self):
		start, end = self._period()
		license_doc = ClientDocument.objects.filter(
			client=self.client_profile_1,
			document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
			is_active=True,
		).first()
		license_doc.expiration_date = end.date() - timedelta(days=1)
		license_doc.save(update_fields=["expiration_date"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("DRIVING_LICENSE_EXPIRES_TOO_SOON", response.data.get("details", {}).get("eligibility_errors", []))

	def test_vehicule_inactif_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(self.url, self._payload(vehicle_id=self.vehicle_inactive.id), format="json")
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "VEHICLE_NOT_ACTIVE")

	def test_vehicule_non_disponible_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(self.url, self._payload(vehicle_id=self.vehicle_reserved.id), format="json")
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "VEHICLE_NOT_BOOKABLE")

	def test_periode_invalide_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		start = timezone.now() + timedelta(hours=10)
		end = start - timedelta(hours=1)
		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "INVALID_PERIOD")

	def test_vehicule_deja_reserve_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		start, end = self._period()
		self._create_reservation(
			client=self.client_profile_2,
			vehicle=self.vehicle_available,
			status=Reservation.Status.CONFIRMEE,
			start_at=start + timedelta(minutes=10),
			end_at=end - timedelta(minutes=10),
		)

		response = self.client_api.post(
			self.url,
			self._payload(start_at=start, end_at=end),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "VEHICLE_UNAVAILABLE")

	@patch(
		"reservations.services.reservation_creation.calculate_price_simulation",
		return_value=SimpleNamespace(
			vehicle_id=999,
			duration_hours=Decimal("4.00"),
			rental_amount=Decimal("555.55"),
			deposit_amount=Decimal("444.44"),
			insurance_included=True,
			total_amount=Decimal("555.55"),
			pricing_method="MOCKED",
		),
	)
	def test_tarif_est_recalcule_depuis_la_base(self, _mock_pricing):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(self.url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		reservation = Reservation.objects.get(pk=response.data["id"])
		self.assertEqual(reservation.rental_amount, Decimal("555.55"))
		self.assertEqual(reservation.deposit_amount, Decimal("444.44"))

	def test_faux_montant_frontend_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(
			self.url,
			self._payload(rental_amount="0.01", deposit_amount="0.01"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("rental_amount", response.data)
		self.assertIn("deposit_amount", response.data)


class ReservationClientConsultationTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.list_url = reverse("reservations:reservation-list-create")
		self.owned_reservation = self._create_reservation(client=self.client_profile_1)
		self.owned_reservation_2 = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			start_at=timezone.now() + timedelta(days=2),
			end_at=timezone.now() + timedelta(days=2, hours=3),
		)
		self.other_reservation = self._create_reservation(
			client=self.client_profile_2,
			start_at=timezone.now() + timedelta(days=3),
			end_at=timezone.now() + timedelta(days=3, hours=3),
		)

	def test_liste_limitee_au_client(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		ids = {item["id"] for item in response.data["results"]}
		self.assertIn(self.owned_reservation.id, ids)
		self.assertIn(self.owned_reservation_2.id, ids)
		self.assertNotIn(self.other_reservation.id, ids)

	def test_detail_proprietaire(self):
		self.client_api.force_authenticate(self.client_user_1)
		url = reverse("reservations:reservation-detail", kwargs={"pk": self.owned_reservation.id})
		response = self.client_api.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["id"], self.owned_reservation.id)

	def test_autre_client_obtient_404(self):
		self.client_api.force_authenticate(self.client_user_2)
		url = reverse("reservations:reservation-detail", kwargs={"pk": self.owned_reservation.id})
		response = self.client_api.get(url)
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_anonyme_refuse(self):
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_mecanicien_refuse(self):
		self.client_api.force_authenticate(self.mechanic_user)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_filtre_par_statut(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.get(self.list_url, {"status": Reservation.Status.EN_ATTENTE_PAIEMENT})
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		ids = {item["id"] for item in response.data["results"]}
		self.assertEqual(ids, {self.owned_reservation_2.id})

	def test_pagination_active(self):
		for idx in range(25):
			self._create_reservation(
				client=self.client_profile_1,
				start_at=timezone.now() + timedelta(days=4 + idx),
				end_at=timezone.now() + timedelta(days=4 + idx, hours=3),
			)
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn("count", response.data)
		self.assertIn("results", response.data)
		self.assertEqual(len(response.data["results"]), 20)

	def test_aucune_donnee_sensible(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		first = response.data["results"][0]
		for forbidden_key in ["password", "document_number", "file", "iban", "card_number", "registration_number"]:
			self.assertNotIn(forbidden_key, first)


class ReservationCancellationTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def test_proprietaire_peut_annuler_brouillon(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		notif_before = Notification.objects.count()
		self.client_api.force_authenticate(self.client_user_1)

		with self.captureOnCommitCallbacks(execute=True):
			response = self.client_api.post(url, {"reason": "Changement de plan"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
		self.assertIsNotNone(reservation.cancelled_at)
		self.assertEqual(Notification.objects.count(), notif_before + 1)
		self.assertTrue(
			Notification.objects.filter(
				notification_type="RESERVATION_CANCELLED",
				title="Reservation annulee",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).exists()
		)

	def test_motif_obligatoire(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "   "}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("reason", response.data)

	def test_autre_client_refuse(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_2)

		response = self.client_api.post(url, {"reason": "Non proprietaire"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_reservation_deja_annulee_refusee(self):
		reservation = self._create_reservation(status=Reservation.Status.ANNULEE)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Double annulation"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "ALREADY_CANCELLED")

	def test_en_cours_refusee(self):
		start = timezone.now() - timedelta(hours=1)
		end = timezone.now() + timedelta(hours=2)
		reservation = self._create_reservation(
			status=Reservation.Status.EN_COURS,
			start_at=start,
			end_at=end,
		)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Trop tard"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "CANNOT_CANCEL")

	def test_terminee_refusee(self):
		start = timezone.now() - timedelta(days=2)
		end = timezone.now() - timedelta(days=1)
		reservation = self._create_reservation(
			status=Reservation.Status.TERMINEE,
			start_at=start,
			end_at=end,
		)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Deja terminee"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "CANNOT_CANCEL")

	def test_confirmee_future_annulable(self):
		start = timezone.now() + timedelta(days=2)
		end = start + timedelta(hours=3)
		reservation = self._create_reservation(
			status=Reservation.Status.CONFIRMEE,
			start_at=start,
			end_at=end,
		)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Empêchement"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		self.assertEqual(reservation.status, Reservation.Status.ANNULEE)

	def test_confirmee_commencee_non_annulable(self):
		start = timezone.now() - timedelta(minutes=10)
		end = timezone.now() + timedelta(hours=2)
		reservation = self._create_reservation(
			status=Reservation.Status.CONFIRMEE,
			start_at=start,
			end_at=end,
		)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Debut depasse"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "CANNOT_CANCEL")

	def test_aucun_remboursement_cree_a_ce_stade(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
		payment_before = self._optional_model_count("payments", "Payment")
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(url, {"reason": "Annulation simple"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		if payment_before is not None:
			self.assertEqual(apps.get_model("payments", "Payment").objects.count(), payment_before)


class ReservationVehicleAccessTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _make_active_access(self, reservation):
		if reservation.status != Reservation.Status.EN_COURS:
			reservation.status = Reservation.Status.EN_COURS
			reservation.confirmed_at = reservation.confirmed_at or timezone.now()
			reservation.save(update_fields=["status", "confirmed_at", "updated_at"])

		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])

		inspection, _ = reservation.inspections.get_or_create(
			inspection_type="INITIAL",
			defaults={
				"status": "TERMINE",
				"completed_at": timezone.now(),
				"completed_by": self.client_user_1,
			},
		)
		inspection.status = "TERMINE"
		inspection.completed_at = inspection.completed_at or timezone.now()
		inspection.completed_by = inspection.completed_by or self.client_user_1
		inspection.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])

		return activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)

	def test_unlock_and_lock_routes_are_resolved(self):
		self.assertEqual(reverse("reservations:reservation-unlock", kwargs={"pk": 1}), "/api/v1/reservations/1/unlock/")
		self.assertEqual(reverse("reservations:reservation-lock", kwargs={"pk": 1}), "/api/v1/reservations/1/lock/")

	def test_unlock_and_lock_succeed_for_owner_with_active_access(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=1),
			end_at=timezone.now() + timedelta(hours=3),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)
		self.assertEqual(unlock_response.data["message"], "Véhicule déverrouillé.")
		self.assertEqual(unlock_response.data["state"], "UNLOCKED")
		self.assertIn("timestamp", unlock_response.data)

		lock_response = self.client_api.post(lock_url, format="json")
		self.assertEqual(lock_response.status_code, status.HTTP_200_OK)
		self.assertEqual(lock_response.data["message"], "Véhicule verrouillé.")
		self.assertEqual(lock_response.data["state"], "LOCKED")
		self.assertIn("timestamp", lock_response.data)

		self.assertTrue(LockingLog.objects.filter(reservation=reservation, result=LockingLog.Result.SUCCESS).exists())

	def test_foreign_reservation_returns_not_owner_without_exposing_details(self):
		reservation = self._create_reservation(
			client=self.client_profile_2,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=1),
			end_at=timezone.now() + timedelta(hours=3),
		)
		self._make_active_access(reservation)
		url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(url, format="json")

		self.assertIn(response.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND})
		self.assertEqual(response.data["code"], "NOT_OWNER")
		self.assertFalse("reference" in response.data or "vehicle" in response.data)

	def test_lock_without_access_returns_not_found_or_conflict(self):
		reservation = self._create_reservation(client=self.client_profile_1, status=Reservation.Status.EN_COURS)
		url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(url, format="json")

		self.assertIn(response.status_code, {status.HTTP_404_NOT_FOUND, status.HTTP_409_CONFLICT})

	def test_unlock_rejects_unexpected_payload_fields(self):
		reservation = self._create_reservation(client=self.client_profile_1, status=Reservation.Status.EN_COURS)
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			{
				"vehicle_id": 1,
				"client_id": 1,
				"access_id": 1,
				"state": "UNLOCKED",
				"pin": "1234",
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("vehicle_id", response.data)
		self.assertIn("client_id", response.data)
		self.assertIn("access_id", response.data)
		self.assertIn("state", response.data)
		self.assertIn("pin", response.data)

	def test_lock_a_controler_with_final_completed_is_allowed(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		reservation.status = Reservation.Status.A_CONTROLER
		reservation.save(update_fields=["status", "updated_at"])

		response = self.client_api.post(lock_url, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["state"], VehicleAccess.LockState.LOCKED)
		access = VehicleAccess.objects.get(reservation=reservation)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)
		self.assertEqual(access.status, VehicleAccess.Status.REVOKED)
		self.assertFalse(access.is_active)
		reservation.refresh_from_db()
		reservation.vehicle.refresh_from_db()
		self.assertEqual(reservation.status, Reservation.Status.A_CONTROLER)
		self.assertEqual(reservation.vehicle.status, Vehicle.Status.LOUE)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.LOCK,
				result=LockingLog.Result.SUCCESS,
			).exists()
		)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.ACCESS_REVOKED,
				result=LockingLog.Result.SUCCESS,
			).exists()
		)


class ReservationManagementCompletionTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.url = lambda reservation_id: reverse("reservations:management-reservation-complete", kwargs={"pk": reservation_id})

	def _make_active_access(self, reservation):
		if reservation.status != Reservation.Status.EN_COURS:
			reservation.status = Reservation.Status.EN_COURS
			reservation.confirmed_at = reservation.confirmed_at or timezone.now()
			reservation.save(update_fields=["status", "confirmed_at", "updated_at"])

		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])

		inspection, _ = reservation.inspections.get_or_create(
			inspection_type="INITIAL",
			defaults={
				"status": "TERMINE",
				"completed_at": timezone.now(),
				"completed_by": self.client_user_1,
			},
		)
		inspection.status = "TERMINE"
		inspection.completed_at = inspection.completed_at or timezone.now()
		inspection.completed_by = inspection.completed_by or self.client_user_1
		inspection.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])

		return activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)

	def _prepare_completed_return_workflow(self, reservation):
		if reservation.status != Reservation.Status.A_CONTROLER:
			reservation.status = Reservation.Status.A_CONTROLER
			reservation.save(update_fields=["status", "updated_at"])

		reservation.vehicle.status = Vehicle.Status.DISPONIBLE
		reservation.vehicle.save(update_fields=["status", "updated_at"])

		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)

		mechanic = get_user_model().objects.create_user(
			email="mechanic.complete@example.com",
			password="password123",
			first_name="Mech",
			last_name="Complete",
		)
		mechanic.role = self.mechanic_user.role
		mechanic.save(update_fields=["role"])
		cleaner = get_user_model().objects.create_user(
			email="cleaner.complete@example.com",
			password="password123",
			first_name="Clean",
			last_name="Complete",
		)
		cleaner.role = self.cleaner_user.role
		cleaner.save(update_fields=["role"])

		Intervention.objects.create(
			reservation=reservation,
			vehicle=reservation.vehicle,
			created_by=self.manager_user,
			reference="INT-COMP-001",
			intervention_type=Intervention.Type.MECANIQUE,
			status=Intervention.Status.TERMINEE,
			assigned_to=mechanic,
			started_at=timezone.now() - timedelta(hours=1),
			completed_at=timezone.now(),
		)
		Intervention.objects.create(
			reservation=reservation,
			vehicle=reservation.vehicle,
			created_by=self.manager_user,
			reference="INT-COMP-002",
			intervention_type=Intervention.Type.NETTOYAGE,
			status=Intervention.Status.TERMINEE,
			assigned_to=cleaner,
			started_at=timezone.now() - timedelta(hours=1),
			completed_at=timezone.now(),
		)

	def test_management_complete_routes_are_resolved(self):
		self.assertEqual(reverse("reservations:management-reservation-complete", kwargs={"pk": 1}), "/api/v1/management/reservations/1/complete/")
		self.assertIs(resolve("/api/v1/management/reservations/1/complete/").func.view_class, ReservationManagementCompleteView)

	def test_manager_can_close_a_controler_reservation_when_vehicle_is_disponible(self):
		reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self._prepare_completed_return_workflow(reservation)
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(self.url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		self.assertEqual(reservation.status, Reservation.Status.TERMINEE)
		self.assertEqual(response.data["reservation"]["status"], Reservation.Status.TERMINEE)

	def test_rejects_when_vehicle_is_not_disponible(self):
		reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self._prepare_completed_return_workflow(reservation)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(self.url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "VEHICLE_NOT_AVAILABLE")

	def test_rejects_when_final_inspection_is_missing(self):
		reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		reservation.vehicle.status = Vehicle.Status.DISPONIBLE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(self.url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "FINAL_INSPECTION_REQUIRED")

	def test_rejects_when_pending_intervention_exists(self):
		reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		reservation.vehicle.status = Vehicle.Status.DISPONIBLE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		Intervention.objects.create(
			reservation=reservation,
			vehicle=reservation.vehicle,
			created_by=self.manager_user,
			reference="INT-COMP-003",
			intervention_type=Intervention.Type.MECANIQUE,
			status=Intervention.Status.EN_COURS,
			assigned_to=self.mechanic_user,
			started_at=timezone.now(),
		)
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(self.url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "INTERVENTIONS_NOT_COMPLETED")

	def test_rejects_for_non_manager_role(self):
		reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self._prepare_completed_return_workflow(reservation)
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self.url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_lock_a_controler_without_final_completed_is_refused(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		reservation.status = Reservation.Status.A_CONTROLER
		reservation.save(update_fields=["status", "updated_at"])

		response = self.client_api.post(lock_url, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "FINAL_INSPECTION_REQUIRED")
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.LOCK,
				result=LockingLog.Result.FAILURE,
				failure_code="FINAL_INSPECTION_REQUIRED",
			).exists()
		)

	def test_lock_a_controler_with_final_not_completed_is_refused(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.BROUILLON,
		)
		reservation.status = Reservation.Status.A_CONTROLER
		reservation.save(update_fields=["status", "updated_at"])

		response = self.client_api.post(lock_url, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "FINAL_INSPECTION_NOT_COMPLETED")

	def test_lock_a_controler_is_routed_as_final_lock_after_status_refresh(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		stale_reservation = Reservation.objects.get(pk=reservation.pk)
		Reservation.objects.filter(pk=reservation.pk).update(status=Reservation.Status.A_CONTROLER)

		with patch.object(ReservationLockView, "get_object", return_value=stale_reservation):
			response = self.client_api.post(lock_url, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["state"], VehicleAccess.LockState.LOCKED)

	def test_lock_already_locked_returns_clear_error(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(lock_url, format="json")

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "ALREADY_LOCKED")

	def test_final_lock_double_call_is_idempotent(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		unlock_url = reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id})
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		unlock_response = self.client_api.post(unlock_url, format="json")
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		reservation.status = Reservation.Status.A_CONTROLER
		reservation.save(update_fields=["status", "updated_at"])

		first_response = self.client_api.post(lock_url, format="json")
		second_response = self.client_api.post(lock_url, format="json")

		self.assertEqual(first_response.status_code, status.HTTP_200_OK)
		self.assertEqual(second_response.status_code, status.HTTP_200_OK)
		self.assertEqual(second_response.data["state"], VehicleAccess.LockState.LOCKED)

	def test_lock_other_client_reservation_is_refused(self):
		reservation = self._create_reservation(
			client=self.client_profile_2,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=3),
			end_at=timezone.now() - timedelta(minutes=30),
		)
		self._make_active_access(reservation)
		lock_url = reverse("reservations:reservation-lock", kwargs={"pk": reservation.id})

		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.post(lock_url, format="json")

		self.assertIn(response.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND})
		self.assertEqual(response.data["code"], "NOT_OWNER")


class ReservationDepositAuthorizationTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _deposit_url(self, reservation_id):
		return reverse("reservations:reservation-deposit-authorize", kwargs={"pk": reservation_id})

	def test_simulated_mode_succeeds_and_does_not_store_card_number(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		deposit = Deposit.objects.get(reservation=reservation)
		self.assertEqual(deposit.status, Deposit.Status.AUTORISEE)
		self.assertEqual(deposit.mode, Deposit.Mode.SIMULATED)
		self.assertEqual(reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
		self.assertTrue(Notification.objects.filter(notification_type="DEPOSIT_AUTHORIZED", related_object_id=reservation.id).exists())

		for forbidden_key in ["card_number", "cvc", "expiry", "pin", "secret_key"]:
			self.assertNotIn(forbidden_key, response.data)
			self.assertNotIn(forbidden_key, {field.name for field in Deposit._meta.get_fields()})

	@patch("payments.services.deposits.stripe.PaymentIntent.create")
	@patch("payments.services.deposits.stripe.PaymentIntent.modify")
	def test_stripe_test_mode_is_mocked_and_returns_client_secret_only(self, mocked_modify, mocked_create):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_create.return_value = SimpleNamespace(
			id="pi_dep_123",
			client_secret="dep_secret_123",
			charges=SimpleNamespace(data=[]),
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "STRIPE_TEST"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["client_secret"], "dep_secret_123")
		self.assertEqual(response.data["stripe_payment_intent_id"], "pi_dep_123")
		mocked_create.assert_called_once()
		mocked_modify.assert_not_called()

	def test_other_client_is_refused(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_2)

		response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	@patch(
		"payments.services.deposits.calculate_price_simulation",
		return_value=SimpleNamespace(
			vehicle_id=999,
			duration_hours=Decimal("4.00"),
			rental_amount=Decimal("111.11"),
			deposit_amount=Decimal("555.55"),
			insurance_included=True,
			total_amount=Decimal("111.11"),
			pricing_method="MOCKED",
		),
	)
	def test_deposit_amount_is_recalculated_server_side(self, _mock_pricing):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		reservation.deposit_amount = Decimal("0.00")
		reservation.save(update_fields=["deposit_amount", "updated_at"])
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		deposit = Deposit.objects.get(reservation=reservation)
		self.assertEqual(reservation.deposit_amount, Decimal("555.55"))
		self.assertEqual(deposit.amount, Decimal("555.55"))

	def test_double_request_is_idempotent(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_1)

		first = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")
		second = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

		self.assertEqual(first.status_code, status.HTTP_200_OK)
		self.assertEqual(second.status_code, status.HTTP_200_OK)
		self.assertEqual(Deposit.objects.filter(reservation=reservation).count(), 1)
		self.assertEqual(first.data["deposit_id"], second.data["deposit_id"])

	@patch(
		"payments.services.deposits.validate_client_for_reservation",
		return_value=SimpleNamespace(is_eligible=False, errors=["PROFILE_NOT_VALID"]),
	)
	def test_invalid_profile_is_refused(self, _mock_eligibility):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")


class ReservationPaymentIntentTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _payment_intent_url(self, reservation_id):
		return reverse("reservations:reservation-payment-intent", kwargs={"pk": reservation_id})

	def _create_authorized_deposit(self, reservation):
		return Deposit.objects.create(
			reservation=reservation,
			mode=Deposit.Mode.SIMULATED,
			amount=reservation.deposit_amount,
			currency="EUR",
			status=Deposit.Status.AUTORISEE,
			authorized_at=timezone.now(),
		)

	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	@patch("payments.services.payment_intents.stripe.PaymentIntent.modify")
	def test_owner_is_authorized_and_only_client_secret_is_returned(self, mocked_modify, mocked_create):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_create.return_value = SimpleNamespace(
			id="pi_pay_123",
			status="requires_action",
			client_secret="pi_secret_123",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(set(response.data.keys()), {"client_secret", "payment_id"})
		self.assertEqual(response.data["client_secret"], "pi_secret_123")
		payment = Payment.objects.get(pk=response.data["payment_id"])
		self.assertEqual(payment.stripe_payment_intent_id, "pi_pay_123")
		mocked_modify.assert_not_called()

	def test_other_client_is_refused(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_2)

		response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_missing_deposit_is_refused(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self.client_api.force_authenticate(self.client_user_1)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "DEPOSIT_NOT_AUTHORIZED")

	@patch(
		"payments.services.payment_intents._assert_vehicle_still_available",
		side_effect=Exception(),
	)
	def test_availability_is_rechecked(self, _mock_vehicle_check):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)

		from payments.services.payment_intents import PaymentIntentError
		_mock_vehicle_check.side_effect = PaymentIntentError(
			code="RESERVATION_UNAVAILABLE",
			message="Le vehicule n'est plus disponible pour cette reservation.",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "RESERVATION_UNAVAILABLE")

	@patch(
		"payments.services.payment_intents.validate_client_for_reservation",
		return_value=SimpleNamespace(is_eligible=False, errors=["PROFILE_NOT_VALID"]),
	)
	def test_profile_is_rechecked(self, _mock_eligibility):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")

	@patch(
		"payments.services.payment_intents.calculate_price_simulation",
		return_value=SimpleNamespace(
			vehicle_id=999,
			duration_hours=Decimal("4.00"),
			rental_amount=Decimal("222.22"),
			deposit_amount=Decimal("333.33"),
			insurance_included=True,
			total_amount=Decimal("222.22"),
			pricing_method="MOCKED",
		),
	)
	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_amount_is_recalculated_server_side(self, mocked_create, _mock_pricing):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		reservation.rental_amount = Decimal("10.00")
		reservation.save(update_fields=["rental_amount", "updated_at"])
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_create.return_value = SimpleNamespace(
			id="pi_pay_recalc",
			status="requires_payment_method",
			client_secret="secret_recalc",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		reservation.refresh_from_db()
		payment = Payment.objects.get(pk=response.data["payment_id"])
		self.assertEqual(reservation.rental_amount, Decimal("222.22"))
		self.assertEqual(payment.amount, Decimal("222.22"))

	@patch("payments.services.payment_intents.stripe.PaymentIntent.retrieve")
	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_idempotency_key_is_sent_to_stripe(self, mocked_create, mocked_retrieve):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_retrieve.return_value = SimpleNamespace(status="canceled", client_secret=None)
		mocked_create.return_value = SimpleNamespace(
			id="pi_pay_idempo",
			status="requires_confirmation",
			client_secret="secret_idempo",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		kwargs = mocked_create.call_args.kwargs
		expected_key = f"reservation-payment-{reservation.id}-8000"
		self.assertEqual(kwargs["idempotency_key"], expected_key)

	@patch("payments.services.payment_intents.stripe.PaymentIntent.retrieve")
	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_existing_payment_intent_is_reused(self, mocked_create, mocked_retrieve):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		self._create_authorized_deposit(reservation)
		pricing = calculate_price_simulation(
			vehicle=reservation.vehicle,
			start_at=reservation.start_at,
			end_at=reservation.end_at,
		)
		expected_amount = pricing.rental_amount
		existing = Payment.objects.create(
			reservation=reservation,
			provider=Payment.Provider.STRIPE,
			amount=expected_amount,
			currency="EUR",
			status=Payment.Status.EN_ATTENTE,
			stripe_payment_intent_id="pi_existing_123",
		)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_retrieve.return_value = SimpleNamespace(
			id="pi_existing_123",
			status="requires_payment_method",
			client_secret="secret_existing",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["payment_id"], existing.id)
		self.assertEqual(response.data["client_secret"], "secret_existing")
		mocked_create.assert_not_called()

	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_payment_is_allowed_for_its_own_reserved_vehicle(self, mocked_create):
		reservation = self._create_reservation(
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			vehicle=self.vehicle_reserved,
		)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_create.return_value = SimpleNamespace(
			id="pi_reserved_ok",
			status="requires_action",
			client_secret="secret_reserved_ok",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["client_secret"], "secret_reserved_ok")

	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_current_reservation_is_excluded_from_conflict_search(self, mocked_create):
		start, end = self._period()
		reservation = self._create_reservation(
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			vehicle=self.vehicle_reserved,
			start_at=start,
			end_at=end,
		)
		self._create_authorized_deposit(reservation)
		self.client_api.force_authenticate(self.client_user_1)
		mocked_create.return_value = SimpleNamespace(
			id="pi_self_ok",
			status="requires_action",
			client_secret="secret_self_ok",
		)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)

	@patch("payments.services.payment_intents.stripe.PaymentIntent.create")
	def test_overlapping_other_reservation_is_still_refused(self, mocked_create):
		start, end = self._period()
		reservation = self._create_reservation(
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			vehicle=self.vehicle_reserved,
			start_at=start,
			end_at=end,
		)
		self._create_authorized_deposit(reservation)
		self._create_reservation(
			client=self.client_profile_2,
			vehicle=self.vehicle_reserved,
			status=Reservation.Status.CONFIRMEE,
			start_at=start + timedelta(minutes=15),
			end_at=end - timedelta(minutes=15),
		)
		self.client_api.force_authenticate(self.client_user_1)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "RESERVATION_UNAVAILABLE")
		mocked_create.assert_not_called()

	def test_non_authorized_deposit_is_still_refused(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
		Deposit.objects.create(
			reservation=reservation,
			mode=Deposit.Mode.SIMULATED,
			amount=reservation.deposit_amount,
			currency="EUR",
			status=Deposit.Status.EN_ATTENTE,
		)
		self.client_api.force_authenticate(self.client_user_1)

		with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
			response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["code"], "DEPOSIT_NOT_AUTHORIZED")


class ReservationManagementConsultationTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.list_url = reverse("reservations:management-reservation-list")
		self.reservation_client_1 = self._create_reservation(client=self.client_profile_1, vehicle=self.vehicle_available)
		self.reservation_client_2 = self._create_reservation(
			client=self.client_profile_2,
			vehicle=self.vehicle_reserved,
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			start_at=timezone.now() + timedelta(days=2),
			end_at=timezone.now() + timedelta(days=2, hours=4),
		)

	def test_gestionnaire_voit_toutes_les_reservations(self):
		self.client_api.force_authenticate(self.manager_user)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		ids = {item["id"] for item in response.data["results"]}
		self.assertIn(self.reservation_client_1.id, ids)
		self.assertIn(self.reservation_client_2.id, ids)

	def test_administrateur_autorise(self):
		self.client_api.force_authenticate(self.admin_user)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_client_refuse(self):
		self.client_api.force_authenticate(self.client_user_1)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_mecanicien_refuse(self):
		self.client_api.force_authenticate(self.mechanic_user)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_nettoyeur_refuse(self):
		self.client_api.force_authenticate(self.cleaner_user)
		response = self.client_api.get(self.list_url)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_recherche_par_reference_client_et_vehicule(self):
		self.client_api.force_authenticate(self.manager_user)

		by_reference = self.client_api.get(self.list_url, {"search": self.reservation_client_1.reference})
		self.assertEqual(by_reference.status_code, status.HTTP_200_OK)
		ids_reference = {item["id"] for item in by_reference.data["results"]}
		self.assertIn(self.reservation_client_1.id, ids_reference)

		by_client = self.client_api.get(self.list_url, {"search": self.client_user_2.email})
		self.assertEqual(by_client.status_code, status.HTTP_200_OK)
		ids_client = {item["id"] for item in by_client.data["results"]}
		self.assertIn(self.reservation_client_2.id, ids_client)

		by_vehicle = self.client_api.get(self.list_url, {"search": self.vehicle_reserved.registration_number})
		self.assertEqual(by_vehicle.status_code, status.HTTP_200_OK)
		ids_vehicle = {item["id"] for item in by_vehicle.data["results"]}
		self.assertIn(self.reservation_client_2.id, ids_vehicle)

	def test_aucune_donnee_documentaire_ou_bancaire_exposee(self):
		self.client_api.force_authenticate(self.manager_user)
		detail_url = reverse("reservations:management-reservation-detail", kwargs={"pk": self.reservation_client_1.id})
		response = self.client_api.get(detail_url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		client_summary = response.data.get("client_summary", {})
		self.assertIn("email", client_summary)
		for forbidden_key in [
			"password",
			"document_number",
			"file",
			"validated_by",
			"iban",
			"bank_account",
			"card_number",
		]:
			self.assertNotIn(forbidden_key, response.data)
			self.assertNotIn(forbidden_key, client_summary)


class ReservationConcurrencyAuditTests(TestCase):
	def test_create_draft_reservation_uses_atomic_lock_and_rechecks_availability(self):
		source = inspect.getsource(create_draft_reservation)

		self.assertIn("with transaction.atomic():", source)
		self.assertIn("select_for_update", source)
		self.assertGreaterEqual(source.count("is_vehicle_available("), 2)

		atomic_index = source.find("with transaction.atomic():")
		last_availability_check_index = source.rfind("is_vehicle_available(")
		self.assertGreater(last_availability_check_index, atomic_index)


class ReservationReminderEmailTests(TestCase):
	def setUp(self):
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="reminder-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.client_profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1990, 1, 1),
			address="Rue Reminder 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)

		brand = Brand.objects.create(name="Reminder Brand", is_active=True)
		category = VehicleCategory.objects.create(
			name="Reminder Category",
			description="Category",
			daily_rate=Decimal("60.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		parking = Parking.objects.create(
			name="Reminder Parking",
			address="Rue Reminder Parking 1",
			capacity=10,
			is_active=True,
		)
		space = ParkingSpace.objects.create(parking=parking, number="R1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=brand,
			category=category,
			parking_space=space,
			registration_number="RMD-001",
			model_name="Model Reminder",
			year=2024,
			color="Black",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1000,
			status=Vehicle.Status.RESERVE,
			is_active=True,
		)

	def _create_reservation(self, *, status, start_offset_hours, cancelled=False, reference_time=None):
		now = reference_time or timezone.now()
		start_at = now + timedelta(hours=start_offset_hours)
		end_at = start_at + timedelta(hours=2)
		reservation = Reservation.objects.create(
			client=self.client_profile,
			vehicle=self.vehicle,
			start_at=start_at,
			end_at=end_at,
			status=status,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("300.00"),
			confirmed_at=timezone.now() if status in Reservation.CONFIRMED_STATUSES else None,
			cancelled_at=timezone.now() if cancelled else None,
			cancellation_reason="User cancelled" if cancelled else "",
		)
		return reservation

	@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
	def test_confirmed_reservation_around_24h_sends_email_once(self):
		reference_time = timezone.now()
		reservation = self._create_reservation(
			status=Reservation.Status.CONFIRMEE,
			start_offset_hours=24,
			reference_time=reference_time,
		)

		sent_count = send_reservation_24h_reminders(reference_time=reference_time)

		self.assertEqual(sent_count, 1)
		self.assertEqual(len(mail.outbox), 1)
		sent_email = mail.outbox[0]
		self.assertEqual(sent_email.subject, "Rappel de votre réservation GetACar")
		self.assertEqual(sent_email.to, [self.client_user.email])
		self.assertIn(reservation.reference, sent_email.body)
		self.assertIn(self.vehicle.brand.name, sent_email.body)
		self.assertIn(self.vehicle.model_name, sent_email.body)
		self.assertTrue(
			Notification.objects.filter(
				user=self.client_user,
				notification_type=REMINDER_NOTIFICATION_TYPE,
				related_object_type="reservation",
				related_object_id=reservation.id,
			).exists()
		)

	@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
	def test_cancelled_reservation_sends_no_email(self):
		reference_time = timezone.now()
		self._create_reservation(
			status=Reservation.Status.ANNULEE,
			start_offset_hours=24,
			cancelled=True,
			reference_time=reference_time,
		)

		sent_count = send_reservation_24h_reminders(reference_time=reference_time)

		self.assertEqual(sent_count, 0)
		self.assertEqual(len(mail.outbox), 0)

	@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
	def test_non_confirmed_reservation_sends_no_email(self):
		reference_time = timezone.now()
		self._create_reservation(
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			start_offset_hours=24,
			reference_time=reference_time,
		)

		sent_count = send_reservation_24h_reminders(reference_time=reference_time)

		self.assertEqual(sent_count, 0)
		self.assertEqual(len(mail.outbox), 0)

	@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
	def test_already_sent_reminder_does_not_send_again(self):
		reference_time = timezone.now()
		reservation = self._create_reservation(
			status=Reservation.Status.CONFIRMEE,
			start_offset_hours=24,
			reference_time=reference_time,
		)
		Notification.objects.create(
			user=self.client_user,
			notification_type=REMINDER_NOTIFICATION_TYPE,
			title="Rappel de réservation envoyé",
			message=f"Rappel 24h envoyé pour la réservation {reservation.reference}.",
			related_object_type="reservation",
			related_object_id=reservation.id,
		)

		sent_count = send_reservation_24h_reminders(reference_time=reference_time)

		self.assertEqual(sent_count, 0)
		self.assertEqual(len(mail.outbox), 0)
