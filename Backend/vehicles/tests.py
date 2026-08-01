from io import BytesIO
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory, VehiclePhoto
from vehicles.services import (
	AvailabilityValidationError,
	BLOCKING_RESERVATION_STATUSES,
	calculate_duration_hours,
	is_vehicle_available,
	validate_availability_period,
)


def _create_test_image_file(name="vehicle.jpg", image_format="JPEG", content_type="image/jpeg"):
	buffer = BytesIO()
	Image.new("RGB", (40, 40), color=(220, 20, 60)).save(buffer, format=image_format)
	return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


def _create_corrupted_image_file(name="broken.jpg", content_type="image/jpeg"):
	return SimpleUploadedFile(name, b"not-an-image", content_type=content_type)


class VehicleTestDataMixin:
	@classmethod
	def setUpTestData(cls):
		cls.role_client = Role.objects.create(code=Role.Code.CLIENT, label="Client")
		cls.role_manager = Role.objects.create(
			code=Role.Code.GESTIONNAIRE_COMPTABLE,
			label="Gestionnaire",
		)
		cls.role_admin = Role.objects.create(code=Role.Code.ADMINISTRATEUR, label="Admin")
		cls.role_mechanic = Role.objects.create(code=Role.Code.MECANICIEN, label="Mecanicien")

		User = get_user_model()
		cls.manager_user = User.objects.create_user(
			email="manager@example.com",
			password="Pass1234!",
			first_name="Manager",
			last_name="User",
			role=cls.role_manager,
		)
		cls.admin_user = User.objects.create_user(
			email="admin@example.com",
			password="Pass1234!",
			first_name="Admin",
			last_name="User",
			role=cls.role_admin,
		)
		cls.client_user = User.objects.create_user(
			email="client@example.com",
			password="Pass1234!",
			first_name="Client",
			last_name="User",
			role=cls.role_client,
		)
		cls.mechanic_user = User.objects.create_user(
			email="mechanic@example.com",
			password="Pass1234!",
			first_name="Mecanicien",
			last_name="User",
			role=cls.role_mechanic,
		)

		cls.brand_active = Brand.objects.create(name="Toyota", is_active=True)
		cls.brand_inactive = Brand.objects.create(name="OldBrand", is_active=False)

		cls.category_active = VehicleCategory.objects.create(
			name="Citadine",
			description="Cat active",
			daily_rate="49.99",
			hourly_rate="9.99",
			minimum_deposit="300.00",
			minimum_rental_hours=1,
			is_active=True,
		)
		cls.category_inactive = VehicleCategory.objects.create(
			name="Luxury Inactive",
			description="Cat inactive",
			daily_rate="99.99",
			hourly_rate="19.99",
			minimum_deposit="500.00",
			minimum_rental_hours=1,
			is_active=False,
		)

		cls.parking_active = Parking.objects.create(
			name="Parking A",
			address="1 rue de la Gare",
			latitude="50.850340",
			longitude="4.351710",
			capacity=100,
			is_active=True,
		)
		cls.parking_inactive = Parking.objects.create(
			name="Parking B",
			address="2 rue inactive",
			latitude="50.845000",
			longitude="4.360000",
			capacity=20,
			is_active=False,
		)

		cls.space_a1 = ParkingSpace.objects.create(parking=cls.parking_active, number="A1", is_active=True)
		cls.space_a2 = ParkingSpace.objects.create(parking=cls.parking_active, number="A2", is_active=True)
		cls.space_a3 = ParkingSpace.objects.create(parking=cls.parking_active, number="A3", is_active=True)
		cls.space_b1 = ParkingSpace.objects.create(parking=cls.parking_inactive, number="B1", is_active=True)

		cls.vehicle_active = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_active,
			parking_space=cls.space_a1,
			registration_number="AA-111-AA",
			model_name="Corolla",
			year=2023,
			color="Blue",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=12000,
			status=Vehicle.Status.DISPONIBLE,
			description="Vehicule actif",
			is_active=True,
		)
		cls.vehicle_loue = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_active,
			parking_space=cls.space_a2,
			registration_number="BB-222-BB",
			model_name="Yaris",
			year=2022,
			color="White",
			energy_type="Essence",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=25000,
			status=Vehicle.Status.LOUE,
			description="Vehicule loue",
			is_active=True,
		)
		cls.vehicle_inactive = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_active,
			parking_space=cls.space_a3,
			registration_number="CC-333-CC",
			model_name="Auris",
			year=2020,
			color="Gray",
			energy_type="Diesel",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=60000,
			status=Vehicle.Status.DISPONIBLE,
			description="Vehicule inactif",
			is_active=False,
		)


class VehicleModelTests(VehicleTestDataMixin, TestCase):
	def test_brand_name_unique(self):
		with self.assertRaises(ValidationError):
			Brand.objects.create(name="Toyota", is_active=True)

	def test_category_negative_amount_rejected(self):
		with self.assertRaises(ValidationError):
			VehicleCategory.objects.create(
				name="InvalidCat",
				description="invalid",
				daily_rate="-1.00",
				hourly_rate="1.00",
				minimum_deposit="200.00",
				minimum_rental_hours=1,
			)

	def test_parking_space_unique_in_parking(self):
		with self.assertRaises(ValidationError):
			ParkingSpace.objects.create(parking=self.parking_active, number="A1", is_active=True)

	def test_registration_number_unique(self):
		with self.assertRaises(ValidationError):
			Vehicle.objects.create(
				brand=self.brand_active,
				category=self.category_active,
				parking_space=ParkingSpace.objects.create(parking=self.parking_active, number="A4", is_active=True),
				registration_number="AA-111-AA",
				model_name="Duplicate",
				year=2021,
				color="Red",
				energy_type="Essence",
				transmission="Manual",
				seats=5,
				doors=5,
				mileage=1000,
				status=Vehicle.Status.DISPONIBLE,
				is_active=True,
			)

	def test_two_vehicles_cannot_share_same_space(self):
		with self.assertRaises(ValidationError):
			Vehicle.objects.create(
				brand=self.brand_active,
				category=self.category_active,
				parking_space=self.space_a1,
				registration_number="DD-444-DD",
				model_name="SharedSpace",
				year=2021,
				color="Red",
				energy_type="Essence",
				transmission="Manual",
				seats=5,
				doors=5,
				mileage=1000,
				status=Vehicle.Status.DISPONIBLE,
				is_active=True,
			)

	def test_status_choices_exact(self):
		expected = {
			"DISPONIBLE",
			"RESERVE",
			"LOUE",
			"A_CONTROLER",
			"MAINTENANCE",
			"NETTOYAGE",
			"ACCIDENTE",
			"INDISPONIBLE",
		}
		self.assertEqual({value for value, _ in Vehicle.Status.choices}, expected)

	def test_only_one_primary_photo_and_old_primary_disabled(self):
		photo1 = VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("p1.jpg", "JPEG", "image/jpeg"),
			is_primary=True,
			position=1,
		)
		photo2 = VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("p2.jpg", "JPEG", "image/jpeg"),
			is_primary=True,
			position=2,
		)
		photo1.refresh_from_db()
		photo2.refresh_from_db()
		self.assertFalse(photo1.is_primary)
		self.assertTrue(photo2.is_primary)
		self.assertEqual(VehiclePhoto.objects.filter(vehicle=self.vehicle_active, is_primary=True).count(), 1)


class VehiclePublicCatalogTests(VehicleTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def test_public_list_access_without_auth(self):
		response = self.client_api.get("/api/v1/vehicles/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_public_list_is_paginated(self):
		response = self.client_api.get("/api/v1/vehicles/")
		self.assertIn("count", response.data)
		self.assertIn("results", response.data)

	def test_public_list_only_active_vehicles(self):
		response = self.client_api.get("/api/v1/vehicles/")
		returned_ids = {item["id"] for item in response.data["results"]}
		self.assertIn(self.vehicle_active.id, returned_ids)
		self.assertIn(self.vehicle_loue.id, returned_ids)
		self.assertNotIn(self.vehicle_inactive.id, returned_ids)

	def test_public_vehicle_detail(self):
		response = self.client_api.get(f"/api/v1/vehicles/{self.vehicle_active.id}/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["id"], self.vehicle_active.id)

	def test_only_active_categories(self):
		response = self.client_api.get("/api/v1/vehicle-categories/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		category_ids = {item["id"] for item in response.data}
		self.assertIn(self.category_active.id, category_ids)
		self.assertNotIn(self.category_inactive.id, category_ids)

	def test_only_active_parkings(self):
		response = self.client_api.get("/api/v1/parkings/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		parking_ids = {item["id"] for item in response.data}
		self.assertIn(self.parking_active.id, parking_ids)
		self.assertNotIn(self.parking_inactive.id, parking_ids)

	def test_public_payload_hides_confidential_fields(self):
		response = self.client_api.get(f"/api/v1/vehicles/{self.vehicle_active.id}/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		for field in ["mileage", "registration_number", "created_at", "updated_at"]:
			self.assertNotIn(field, response.data)

	def test_exact_location_hidden_when_vehicle_loue(self):
		response = self.client_api.get(f"/api/v1/vehicles/{self.vehicle_loue.id}/")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIsNone(response.data["parking_name"])
		self.assertIsNone(response.data["parking_address"])
		self.assertIsNone(response.data["parking_space_number"])


class VehicleManagementTests(VehicleTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _payload(self, **kwargs):
		base = {
			"brand": self.brand_active.id,
			"category": self.category_active.id,
			"parking_space": kwargs.pop("parking_space", self.space_a3.id),
			"registration_number": kwargs.pop("registration_number", "ZZ-999-ZZ"),
			"model_name": kwargs.pop("model_name", "C-HR"),
			"year": kwargs.pop("year", 2024),
			"color": kwargs.pop("color", "Black"),
			"fuel_type": kwargs.pop("fuel_type", "Hybrid"),
			"transmission": kwargs.pop("transmission", "Auto"),
			"seats": kwargs.pop("seats", 5),
			"doors": kwargs.pop("doors", 5),
			"mileage": kwargs.pop("mileage", 100),
			"description": kwargs.pop("description", "New vehicle"),
			"status": kwargs.pop("status", Vehicle.Status.DISPONIBLE),
			"is_active": kwargs.pop("is_active", True),
		}
		base.update(kwargs)
		return base

	def test_manager_can_create_vehicle(self):
		space = ParkingSpace.objects.create(parking=self.parking_active, number="A5", is_active=True)
		self.client_api.force_authenticate(self.manager_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=space.id, registration_number="MM-555-MM"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_admin_can_create_vehicle(self):
		space = ParkingSpace.objects.create(parking=self.parking_active, number="A6", is_active=True)
		self.client_api.force_authenticate(self.admin_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=space.id, registration_number="NN-666-NN"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_client_cannot_create_vehicle(self):
		space = ParkingSpace.objects.create(parking=self.parking_active, number="A7", is_active=True)
		self.client_api.force_authenticate(self.client_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=space.id, registration_number="CC-777-CC"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_mechanic_cannot_create_vehicle(self):
		space = ParkingSpace.objects.create(parking=self.parking_active, number="A8", is_active=True)
		self.client_api.force_authenticate(self.mechanic_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=space.id, registration_number="MC-888-MC"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_create_fails_for_occupied_parking_space(self):
		self.client_api.force_authenticate(self.manager_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=self.space_a1.id, registration_number="OO-111-OO"),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("parking_space", response.data)

	def test_create_fails_for_duplicated_registration(self):
		space = ParkingSpace.objects.create(parking=self.parking_active, number="A9", is_active=True)
		self.client_api.force_authenticate(self.manager_user)
		response = self.client_api.post(
			"/api/v1/management/vehicles/",
			self._payload(parking_space=space.id, registration_number=self.vehicle_active.registration_number),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("registration_number", response.data)

	def test_partial_update_vehicle(self):
		self.client_api.force_authenticate(self.manager_user)
		url = f"/api/v1/management/vehicles/{self.vehicle_active.id}/"
		response = self.client_api.patch(url, {"color": "Green"}, format="json")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.vehicle_active.refresh_from_db()
		self.assertEqual(self.vehicle_active.color, "Green")

	def test_status_update_success(self):
		self.client_api.force_authenticate(self.manager_user)
		url = f"/api/v1/management/vehicles/{self.vehicle_active.id}/status/"
		response = self.client_api.patch(url, {"status": Vehicle.Status.RESERVE}, format="json")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.vehicle_active.refresh_from_db()
		self.assertEqual(self.vehicle_active.status, Vehicle.Status.RESERVE)

	def test_status_update_rejects_invalid_status(self):
		self.client_api.force_authenticate(self.manager_user)
		url = f"/api/v1/management/vehicles/{self.vehicle_active.id}/status/"
		response = self.client_api.patch(url, {"status": "INVALID"}, format="json")
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("status", response.data)

	def test_status_update_rejects_incoherent_transition(self):
		self.client_api.force_authenticate(self.manager_user)
		url = f"/api/v1/management/vehicles/{self.vehicle_loue.id}/status/"
		response = self.client_api.patch(url, {"status": Vehicle.Status.DISPONIBLE}, format="json")
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("status", response.data)


@override_settings(USE_TZ=True, TIME_ZONE="Europe/Brussels")
class AvailabilityServiceTests(TestCase):
	def test_validate_period_rejects_missing_start(self):
		start = None
		end = timezone.now() + timedelta(hours=2)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=end)

		self.assertEqual(context.exception.code, "START_REQUIRED")

	def test_validate_period_rejects_missing_end(self):
		start = timezone.now() + timedelta(hours=1)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=None)

		self.assertEqual(context.exception.code, "END_REQUIRED")

	def test_validate_period_rejects_invalid_start(self):
		end = timezone.now() + timedelta(hours=2)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start="2026-01-01", end=end)

		self.assertEqual(context.exception.code, "INVALID_START")

	def test_validate_period_rejects_invalid_end(self):
		start = timezone.now() + timedelta(hours=1)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end="2026-01-01")

		self.assertEqual(context.exception.code, "INVALID_END")

	def test_validate_period_rejects_end_equal_start(self):
		start = timezone.now() + timedelta(hours=1)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=start)

		self.assertEqual(context.exception.code, "END_BEFORE_START")

	def test_validate_period_rejects_end_before_start(self):
		start = timezone.now() + timedelta(hours=2)
		end = start - timedelta(minutes=15)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=end)

		self.assertEqual(context.exception.code, "END_BEFORE_START")

	def test_validate_period_rejects_start_in_past(self):
		start = timezone.now() - timedelta(minutes=1)
		end = timezone.now() + timedelta(hours=1)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=end)

		self.assertEqual(context.exception.code, "START_IN_PAST")

	def test_validate_period_rejects_negative_minimum_hours(self):
		start = timezone.now() + timedelta(hours=1)
		end = start + timedelta(hours=2)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=end, minimum_hours=-1)

		self.assertEqual(context.exception.code, "INVALID_MINIMUM_HOURS")

	def test_validate_period_rejects_too_short_duration(self):
		start = timezone.now() + timedelta(hours=1)
		end = start + timedelta(minutes=30)

		with self.assertRaises(AvailabilityValidationError) as context:
			validate_availability_period(start=start, end=end, minimum_hours=1)

		self.assertEqual(context.exception.code, "DURATION_TOO_SHORT")

	def test_validate_period_returns_normalized_period_for_valid_data(self):
		start = timezone.now() + timedelta(hours=1)
		end = start + timedelta(hours=2, minutes=30)

		result = validate_availability_period(start=start, end=end, minimum_hours=2)

		self.assertEqual(result["start"], start)
		self.assertEqual(result["end"], end)
		self.assertEqual(result["duration_hours"], 2.5)

	def test_calculate_duration_hours_returns_exact_fractional_hours(self):
		start = timezone.now() + timedelta(hours=1)
		end = start + timedelta(hours=1, minutes=15)

		duration = calculate_duration_hours(start, end)

		self.assertEqual(duration, 1.25)

	def test_validate_period_normalizes_naive_datetimes_when_timezone_support_is_enabled(self):
		start = datetime(2030, 1, 1, 10, 0, 0)
		end = datetime(2030, 1, 1, 12, 30, 0)

		result = validate_availability_period(start=start, end=end, minimum_hours=2)

		self.assertTrue(timezone.is_aware(result["start"]))
		self.assertTrue(timezone.is_aware(result["end"]))
		self.assertEqual(result["duration_hours"], 2.5)

	def test_validate_period_accepts_timezone_aware_datetimes(self):
		brussels = ZoneInfo("Europe/Brussels")
		start = datetime.now(brussels) + timedelta(hours=1)
		end = start + timedelta(hours=3)

		result = validate_availability_period(start=start, end=end, minimum_hours=2)

		self.assertEqual(result["start"], start)
		self.assertEqual(result["end"], end)
		self.assertEqual(result["duration_hours"], 3.0)


class _FakeReservationQuerySet:
	def __init__(self, reservations):
		self._reservations = list(reservations)

	def filter(self, **kwargs):
		filtered = []
		for reservation in self._reservations:
			if "vehicle_id" in kwargs and reservation.get("vehicle_id") != kwargs["vehicle_id"]:
				continue
			if "status__in" in kwargs and reservation.get("status") not in kwargs["status__in"]:
				continue
			if "start__lt" in kwargs and not (reservation.get("start") < kwargs["start__lt"]):
				continue
			if "end__gt" in kwargs and not (reservation.get("end") > kwargs["end__gt"]):
				continue
			filtered.append(reservation)
		return _FakeReservationQuerySet(filtered)

	def exists(self):
		return bool(self._reservations)


@override_settings(USE_TZ=True, TIME_ZONE="Europe/Brussels")
class AvailabilityOverlapAndStatusTests(VehicleTestDataMixin, TestCase):
	def _period(self):
		start = timezone.now() + timedelta(days=1)
		end = start + timedelta(hours=4)
		return start, end

	def _reservation(self, *, start, end, status="CONFIRMEE", vehicle=None):
		return {
			"vehicle_id": (vehicle or self.vehicle_active).id,
			"start": start,
			"end": end,
			"status": status,
		}

	def _is_available(self, reservations, *, start=None, end=None):
		if start is None or end is None:
			start, end = self._period()
		reservation_queryset = _FakeReservationQuerySet(reservations)
		return is_vehicle_available(
			vehicle=self.vehicle_active,
			start=start,
			end=end,
			reservation_queryset=reservation_queryset,
		)

	def test_overlap_total_blocks_vehicle(self):
		start, end = self._period()
		reservations = [
			self._reservation(
				start=start + timedelta(minutes=30),
				end=end - timedelta(minutes=30),
			)
		]

		self.assertFalse(self._is_available(reservations))

	def test_overlap_at_beginning_blocks_vehicle(self):
		start, _ = self._period()
		reservations = [
			self._reservation(
				start=start - timedelta(hours=2),
				end=start + timedelta(minutes=30),
			)
		]

		self.assertFalse(self._is_available(reservations))

	def test_overlap_at_end_blocks_vehicle(self):
		start, end = self._period()
		reservations = [
			self._reservation(
				start=end - timedelta(minutes=30),
				end=end + timedelta(hours=2),
			)
		]

		self.assertFalse(self._is_available(reservations))

	def test_encompassing_reservation_blocks_vehicle(self):
		start, end = self._period()
		reservations = [
			self._reservation(
				start=start - timedelta(hours=2),
				end=end + timedelta(hours=2),
			)
		]

		self.assertFalse(self._is_available(reservations))

	def test_left_edge_touching_does_not_overlap(self):
		start, _ = self._period()
		reservations = [
			self._reservation(
				start=start - timedelta(hours=2),
				end=start,
			)
		]

		self.assertTrue(self._is_available(reservations))

	def test_right_edge_touching_does_not_overlap(self):
		start, end = self._period()
		reservations = [
			self._reservation(
				start=end,
				end=end + timedelta(hours=2),
			)
		]

		self.assertTrue(self._is_available(reservations, start=start, end=end))

	def test_blocking_reservation_statuses_block_availability(self):
		start, end = self._period()
		for status_value in BLOCKING_RESERVATION_STATUSES:
			with self.subTest(status=status_value):
				reservation_queryset = _FakeReservationQuerySet(
					[
						self._reservation(
							start=start + timedelta(minutes=10),
							end=end - timedelta(minutes=10),
							status=status_value,
						)
					]
				)

				available = is_vehicle_available(
					vehicle=self.vehicle_active,
					start=start,
					end=end,
					reservation_queryset=reservation_queryset,
				)

				self.assertFalse(available)

	def test_non_blocking_reservation_statuses_do_not_block_availability(self):
		non_blocking_statuses = ["BROUILLON", "ANNULEE", "TERMINEE", "PAIEMENT_ECHOUE"]
		start, end = self._period()
		for status_value in non_blocking_statuses:
			with self.subTest(status=status_value):
				reservation_queryset = _FakeReservationQuerySet(
					[
						self._reservation(
							start=start + timedelta(minutes=10),
							end=end - timedelta(minutes=10),
							status=status_value,
						)
					]
				)

				available = is_vehicle_available(
					vehicle=self.vehicle_active,
					start=start,
					end=end,
					reservation_queryset=reservation_queryset,
				)

				self.assertTrue(available)

	def test_only_disponible_vehicle_status_is_bookable(self):
		non_bookable_statuses = [
			Vehicle.Status.RESERVE,
			Vehicle.Status.LOUE,
			Vehicle.Status.A_CONTROLER,
			Vehicle.Status.MAINTENANCE,
			Vehicle.Status.NETTOYAGE,
			Vehicle.Status.ACCIDENTE,
			Vehicle.Status.INDISPONIBLE,
		]
		start, end = self._period()
		reservation_queryset = _FakeReservationQuerySet([])

		available = is_vehicle_available(
			vehicle=self.vehicle_active,
			start=start,
			end=end,
			reservation_queryset=reservation_queryset,
		)
		self.assertTrue(available)

		for index, status_value in enumerate(non_bookable_statuses, start=1):
			with self.subTest(status=status_value):
				space = ParkingSpace.objects.create(
					parking=self.parking_active,
					number=f"S-{index}",
					is_active=True,
				)
				vehicle = Vehicle.objects.create(
					brand=self.brand_active,
					category=self.category_active,
					parking_space=space,
					registration_number=f"ST-{index:03d}-TS",
					model_name=f"Status {index}",
					year=2024,
					color="Black",
					energy_type="Hybrid",
					transmission="Auto",
					seats=5,
					doors=5,
					mileage=100,
					status=status_value,
					is_active=True,
				)

				is_available = is_vehicle_available(
					vehicle=vehicle,
					start=start,
					end=end,
					reservation_queryset=reservation_queryset,
				)

				self.assertFalse(is_available)


@override_settings(USE_TZ=True, TIME_ZONE="Europe/Brussels")
class VehicleAvailableEndpointTests(VehicleTestDataMixin, TestCase):
	@classmethod
	def setUpTestData(cls):
		super().setUpTestData()
		cls.category_min_4h = VehicleCategory.objects.create(
			name="SUV Min 4h",
			description="Categorie avec minimum 4h",
			daily_rate="79.99",
			hourly_rate="14.99",
			minimum_deposit="400.00",
			minimum_rental_hours=4,
			is_active=True,
		)
		cls.space_a4 = ParkingSpace.objects.create(parking=cls.parking_active, number="A4", is_active=True)
		cls.space_a5 = ParkingSpace.objects.create(parking=cls.parking_active, number="A5", is_active=True)
		cls.space_a6 = ParkingSpace.objects.create(parking=cls.parking_active, number="A6", is_active=True)
		cls.vehicle_min_4h = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_min_4h,
			parking_space=cls.space_a4,
			registration_number="DD-444-DD",
			model_name="RAV4",
			year=2024,
			color="Green",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=5000,
			status=Vehicle.Status.DISPONIBLE,
			description="Vehicule min 4h",
			is_active=True,
		)
		cls.vehicle_inactive_category = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_inactive,
			parking_space=cls.space_a5,
			registration_number="EE-555-EE",
			model_name="Inactive Cat",
			year=2022,
			color="Silver",
			energy_type="Essence",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=18000,
			status=Vehicle.Status.DISPONIBLE,
			description="Categorie inactive",
			is_active=True,
		)
		cls.vehicle_reserved = Vehicle.objects.create(
			brand=cls.brand_active,
			category=cls.category_active,
			parking_space=cls.space_a6,
			registration_number="FF-666-FF",
			model_name="Reserved",
			year=2021,
			color="Red",
			energy_type="Diesel",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=22000,
			status=Vehicle.Status.RESERVE,
			description="Vehicule reserve",
			is_active=True,
		)

	def setUp(self):
		self.client_api = APIClient()

	def _availability_params(self, *, start=None, end=None):
		start_dt = start or (timezone.now() + timedelta(days=1, hours=1))
		end_dt = end or (start_dt + timedelta(hours=3))
		return {
			"start": start_dt.isoformat(),
			"end": end_dt.isoformat(),
		}

	def _fake_get_available_vehicles(self, *, start, end, base_queryset=None, reservation_queryset=None):
		self.assertIsNotNone(base_queryset)
		return base_queryset.filter(status=Vehicle.Status.DISPONIBLE)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_is_public(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles

		response = self.client_api.get("/api/v1/vehicles/available/", self._availability_params())

		self.assertEqual(response.status_code, status.HTTP_200_OK)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_paginated_response(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles

		response = self.client_api.get("/api/v1/vehicles/available/", self._availability_params())

		self.assertIn("count", response.data)
		self.assertIn("results", response.data)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_only_expected_public_vehicles(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles
		start_dt = timezone.now() + timedelta(days=1)
		end_dt = start_dt + timedelta(hours=5)  # > 4h to satisfy vehicle_min_4h

		response = self.client_api.get("/api/v1/vehicles/available/", self._availability_params(start=start_dt, end=end_dt))
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		returned_ids = {item["id"] for item in response.data["results"]}
		self.assertIn(self.vehicle_active.id, returned_ids)
		self.assertIn(self.vehicle_min_4h.id, returned_ids)
		self.assertNotIn(self.vehicle_inactive.id, returned_ids)
		self.assertNotIn(self.vehicle_inactive_category.id, returned_ids)
		self.assertNotIn(self.vehicle_reserved.id, returned_ids)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_filters_by_category_minimum_rental_hours(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles
		start_dt = timezone.now() + timedelta(days=1)
		end_dt = start_dt + timedelta(hours=2)

		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			self._availability_params(start=start_dt, end=end_dt),
		)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		returned_ids = {item["id"] for item in response.data["results"]}
		self.assertIn(self.vehicle_active.id, returned_ids)
		self.assertNotIn(self.vehicle_min_4h.id, returned_ids)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_missing_start(self, mocked_get_available_vehicles):
		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			{"end": (timezone.now() + timedelta(days=1, hours=2)).isoformat()},
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("start", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_missing_end(self, mocked_get_available_vehicles):
		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			{"start": (timezone.now() + timedelta(days=1, hours=1)).isoformat()},
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("end", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_invalid_datetime_format(self, mocked_get_available_vehicles):
		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			{"start": "not-a-date", "end": "still-not-a-date"},
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("start", response.data)
		self.assertIn("end", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_end_before_start(self, mocked_get_available_vehicles):
		start_dt = timezone.now() + timedelta(days=1, hours=2)
		end_dt = start_dt - timedelta(minutes=10)

		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			self._availability_params(start=start_dt, end=end_dt),
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("end", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_start_in_past(self, mocked_get_available_vehicles):
		start_dt = timezone.now() - timedelta(minutes=30)
		end_dt = timezone.now() + timedelta(hours=1)

		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			self._availability_params(start=start_dt, end=end_dt),
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("start", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_returns_400_for_too_short_duration(self, mocked_get_available_vehicles):
		start_dt = timezone.now() + timedelta(days=1)
		end_dt = start_dt + timedelta(minutes=30)

		response = self.client_api.get(
			"/api/v1/vehicles/available/",
			self._availability_params(start=start_dt, end=end_dt),
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("end", response.data)
		mocked_get_available_vehicles.assert_not_called()

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_hides_confidential_fields(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles

		response = self.client_api.get("/api/v1/vehicles/available/", self._availability_params())
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		first_item = response.data["results"][0]
		for field in ["mileage", "registration_number", "created_at", "updated_at"]:
			self.assertNotIn(field, first_item)

	@patch("vehicles.views.public.get_available_vehicles")
	def test_available_endpoint_uses_service_once_and_avoids_n_plus_one(self, mocked_get_available_vehicles):
		mocked_get_available_vehicles.side_effect = self._fake_get_available_vehicles

		with self.assertNumQueries(4):  # min_rental_hours, COUNT, SELECT vehicles, prefetch photos
			response = self.client_api.get("/api/v1/vehicles/available/", self._availability_params())

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		mocked_get_available_vehicles.assert_called_once()


@unittest.skip("Integration avec reservations.Reservation a completer au point 39.")
class AvailabilityIntegrationDeferredTests(TestCase):
	def test_real_reservation_model_integration_deferred_to_point_39(self):
		self.assertTrue(True)


@override_settings(VEHICLE_PHOTO_MAX_SIZE=1024)
class VehiclePhotoManagementTests(VehicleTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.client_api.force_authenticate(self.manager_user)

	def _photo_create_url(self, vehicle_id):
		return f"/api/v1/management/vehicles/{vehicle_id}/photos/"

	def _photo_delete_url(self, vehicle_id, photo_id):
		return f"/api/v1/management/vehicles/{vehicle_id}/photos/{photo_id}/"

	def test_add_jpg_photo(self):
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": _create_test_image_file("car.jpg", "JPEG", "image/jpeg")},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_add_png_photo(self):
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": _create_test_image_file("car.png", "PNG", "image/png")},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_add_webp_photo(self):
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": _create_test_image_file("car.webp", "WEBP", "image/webp")},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_pdf_photo_rejected(self):
		pdf = SimpleUploadedFile("car.pdf", b"%PDF-1.5\n", content_type="application/pdf")
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": pdf},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("file", response.data)

	def test_corrupted_photo_rejected(self):
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": _create_corrupted_image_file()},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("file", response.data)

	def test_too_large_photo_rejected(self):
		big = SimpleUploadedFile("big.jpg", b"x" * 2048, content_type="image/jpeg")
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": big},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("file", response.data)

	def test_client_cannot_add_photo(self):
		self.client_api.force_authenticate(self.client_user)
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{"file": _create_test_image_file("x.jpg", "JPEG", "image/jpeg")},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_only_one_primary_after_adding_primary(self):
		VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("old.jpg", "JPEG", "image/jpeg"),
			is_primary=True,
			position=1,
		)
		response = self.client_api.post(
			self._photo_create_url(self.vehicle_active.id),
			{
				"file": _create_test_image_file("new.jpg", "JPEG", "image/jpeg"),
				"is_primary": True,
				"position": 2,
			},
			format="multipart",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(VehiclePhoto.objects.filter(vehicle=self.vehicle_active, is_primary=True).count(), 1)

	def test_delete_photo(self):
		photo = VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("del.jpg", "JPEG", "image/jpeg"),
			is_primary=False,
			position=3,
		)
		response = self.client_api.delete(self._photo_delete_url(self.vehicle_active.id, photo.id))
		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(VehiclePhoto.objects.filter(id=photo.id).exists())

	def test_delete_photo_from_other_vehicle_returns_404(self):
		photo = VehiclePhoto.objects.create(
			vehicle=self.vehicle_loue,
			file=_create_test_image_file("other.jpg", "JPEG", "image/jpeg"),
			is_primary=False,
			position=1,
		)
		response = self.client_api.delete(self._photo_delete_url(self.vehicle_active.id, photo.id))
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_new_primary_is_selected_when_primary_deleted(self):
		primary = VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("primary.jpg", "JPEG", "image/jpeg"),
			is_primary=True,
			position=3,
		)
		backup = VehiclePhoto.objects.create(
			vehicle=self.vehicle_active,
			file=_create_test_image_file("backup.jpg", "JPEG", "image/jpeg"),
			is_primary=False,
			position=1,
		)
		response = self.client_api.delete(self._photo_delete_url(self.vehicle_active.id, primary.id))
		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		backup.refresh_from_db()
		self.assertTrue(backup.is_primary)
