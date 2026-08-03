from datetime import timedelta
from decimal import Decimal

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import RequestFactory, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientProfile, Role
from inspections.models import Inspection
from interventions.admin import LockingLogAdmin
from interventions.models import LockingLog, VehicleAccess
from interventions.services.vehicle_access import (
	VehicleAccessError,
	VehicleAccessLifecycleError,
	activate_vehicle_access,
	lock_and_revoke_after_return,
	lock_vehicle,
	unlock_vehicle,
)
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class VehicleAccessTestDataMixin:
	@classmethod
	def setUpTestData(cls):
		User = get_user_model()

		cls.role_client = Role.objects.create(code=Role.Code.CLIENT, label="Client")
		cls.role_manager = Role.objects.create(code=Role.Code.GESTIONNAIRE_COMPTABLE, label="Gestionnaire")
		cls.role_admin = Role.objects.create(code=Role.Code.ADMINISTRATEUR, label="Administrateur")

		cls.client_user_1 = User.objects.create_user(
			email="ia-client-1@example.com",
			password="Pass1234!",
			first_name="Alice",
			last_name="Client",
			phone="0400000101",
			role=cls.role_client,
			email_verified=True,
		)
		cls.client_user_2 = User.objects.create_user(
			email="ia-client-2@example.com",
			password="Pass1234!",
			first_name="Bob",
			last_name="Client",
			phone="0400000102",
			role=cls.role_client,
			email_verified=True,
		)
		cls.manager_user = User.objects.create_user(
			email="ia-manager@example.com",
			password="Pass1234!",
			first_name="Mina",
			last_name="Manager",
			phone="0400000103",
			role=cls.role_manager,
			email_verified=True,
		)
		cls.admin_user = User.objects.create_user(
			email="ia-admin@example.com",
			password="Pass1234!",
			first_name="Adam",
			last_name="Admin",
			phone="0400000104",
			role=cls.role_admin,
			email_verified=True,
			is_staff=True,
			is_superuser=True,
		)

		adult_birthdate = timezone.localdate() - timedelta(days=25 * 365)
		cls.client_profile_1 = ClientProfile.objects.create(
			user=cls.client_user_1,
			date_of_birth=adult_birthdate,
			address="Rue Access 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		cls.client_profile_2 = ClientProfile.objects.create(
			user=cls.client_user_2,
			date_of_birth=adult_birthdate,
			address="Rue Access 2",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)

		cls.brand = Brand.objects.create(name="Brand Access", is_active=True)
		cls.category = VehicleCategory.objects.create(
			name="Category Access",
			description="Categorie tests access",
			daily_rate=Decimal("100.00"),
			hourly_rate=Decimal("20.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		cls.parking = Parking.objects.create(
			name="Parking Access",
			address="Rue Parking Access",
			latitude="50.850340",
			longitude="4.351710",
			capacity=30,
			is_active=True,
		)
		cls.space_1 = ParkingSpace.objects.create(parking=cls.parking, number="IA1", is_active=True)
		cls.space_2 = ParkingSpace.objects.create(parking=cls.parking, number="IA2", is_active=True)
		cls.space_3 = ParkingSpace.objects.create(parking=cls.parking, number="IA3", is_active=True)

		cls.vehicle_1 = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_1,
			registration_number="IAT-001",
			model_name="Model One",
			year=2024,
			color="Black",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1200,
			status=Vehicle.Status.LOUE,
			is_active=True,
		)
		cls.vehicle_2 = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_2,
			registration_number="IAT-002",
			model_name="Model Two",
			year=2024,
			color="White",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1800,
			status=Vehicle.Status.LOUE,
			is_active=True,
		)
		cls.vehicle_3 = Vehicle.objects.create(
			brand=cls.brand,
			category=cls.category,
			parking_space=cls.space_3,
			registration_number="IAT-003",
			model_name="Model Three",
			year=2023,
			color="Grey",
			energy_type="Diesel",
			transmission="Manual",
			seats=5,
			doors=5,
			mileage=3200,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)

	def _period(self, *, start_offset_hours=-1, duration_hours=3):
		start_at = timezone.now() + timedelta(hours=start_offset_hours)
		end_at = start_at + timedelta(hours=duration_hours)
		return start_at, end_at

	def _create_reservation(self, *, client=None, vehicle=None, status=Reservation.Status.EN_COURS, start_at=None, end_at=None):
		start, end = (start_at, end_at) if start_at and end_at else self._period()
		confirmed_at = timezone.now() if status in Reservation.CONFIRMED_STATUSES else None
		return Reservation.objects.create(
			client=client or self.client_profile_1,
			vehicle=vehicle or self.vehicle_1,
			start_at=start,
			end_at=end,
			status=status,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("300.00"),
			confirmed_at=confirmed_at,
		)

	def _create_initial_inspection(self, reservation, *, status_value=Inspection.Status.TERMINE, critical=False, completed_by=None):
		return Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.INITIAL,
			status=status_value,
			has_critical_issue=critical,
			completed_at=timezone.now() if status_value == Inspection.Status.TERMINE else None,
			completed_by=completed_by,
		)

	def _activate_access(self, reservation, *, requested_by=None):
		return activate_vehicle_access(
			reservation=reservation,
			requested_by=requested_by or self.client_user_1,
		)


class VehicleAccessModelTests(VehicleAccessTestDataMixin, TestCase):
	def test_single_vehicle_access_per_reservation(self):
		reservation = self._create_reservation()
		now = timezone.now()

		VehicleAccess.objects.create(
			reservation=reservation,
			vehicle=reservation.vehicle,
			client=reservation.client.user,
			status=VehicleAccess.Status.ACTIVE,
			lock_state=VehicleAccess.LockState.LOCKED,
			valid_from=now - timedelta(hours=1),
			valid_until=now + timedelta(hours=1),
			is_active=True,
		)

		with self.assertRaises(ValidationError):
			VehicleAccess.objects.create(
				reservation=reservation,
				vehicle=reservation.vehicle,
				client=reservation.client.user,
				status=VehicleAccess.Status.ACTIVE,
				lock_state=VehicleAccess.LockState.LOCKED,
				valid_from=now - timedelta(hours=1),
				valid_until=now + timedelta(hours=1),
				is_active=True,
			)

	def test_coherence_reservation_vehicle_client(self):
		reservation = self._create_reservation(client=self.client_profile_1, vehicle=self.vehicle_1)
		now = timezone.now()

		with self.assertRaises(ValidationError):
			VehicleAccess.objects.create(
				reservation=reservation,
				vehicle=self.vehicle_2,
				client=reservation.client.user,
				status=VehicleAccess.Status.ACTIVE,
				lock_state=VehicleAccess.LockState.LOCKED,
				valid_from=now - timedelta(hours=1),
				valid_until=now + timedelta(hours=1),
				is_active=True,
			)

		with self.assertRaises(ValidationError):
			VehicleAccess.objects.create(
				reservation=reservation,
				vehicle=reservation.vehicle,
				client=self.client_user_2,
				status=VehicleAccess.Status.ACTIVE,
				lock_state=VehicleAccess.LockState.LOCKED,
				valid_from=now - timedelta(hours=1),
				valid_until=now + timedelta(hours=1),
				is_active=True,
			)

	def test_valid_until_must_be_after_valid_from(self):
		reservation = self._create_reservation()
		now = timezone.now()

		with self.assertRaises(ValidationError):
			VehicleAccess.objects.create(
				reservation=reservation,
				vehicle=reservation.vehicle,
				client=reservation.client.user,
				status=VehicleAccess.Status.PENDING,
				lock_state=VehicleAccess.LockState.LOCKED,
				valid_from=now,
				valid_until=now,
				is_active=False,
			)

	def test_status_and_lock_state_choices_are_exact(self):
		self.assertEqual(
			{value for value, _ in VehicleAccess.Status.choices},
			{"PENDING", "ACTIVE", "REVOKED", "EXPIRED"},
		)
		self.assertEqual(
			{value for value, _ in VehicleAccess.LockState.choices},
			{"LOCKED", "UNLOCKED"},
		)

	def test_revoked_access_cannot_be_active(self):
		reservation = self._create_reservation()
		now = timezone.now()

		with self.assertRaises(ValidationError):
			VehicleAccess.objects.create(
				reservation=reservation,
				vehicle=reservation.vehicle,
				client=reservation.client.user,
				status=VehicleAccess.Status.REVOKED,
				lock_state=VehicleAccess.LockState.LOCKED,
				valid_from=now - timedelta(hours=1),
				valid_until=now + timedelta(hours=1),
				is_active=True,
			)

	def test_str_methods_for_vehicle_access_and_locking_log(self):
		reservation = self._create_reservation()
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)
		access = self._activate_access(reservation)

		log = LockingLog.objects.create(
			vehicle_access=access,
			reservation=reservation,
			vehicle=reservation.vehicle,
			user=self.client_user_1,
			action=LockingLog.Action.LOCK,
			result=LockingLog.Result.SUCCESS,
			metadata={},
		)

		self.assertEqual(str(access), f"VehicleAccess<{reservation.reference}>")
		self.assertEqual(str(log), "LockingLog<LOCK:SUCCESS>")

	def test_locking_log_stores_action_result_and_created_at(self):
		reservation = self._create_reservation()
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)
		access = self._activate_access(reservation)

		log = LockingLog.objects.create(
			vehicle_access=access,
			reservation=reservation,
			vehicle=reservation.vehicle,
			user=self.client_user_1,
			action=LockingLog.Action.UNLOCK,
			result=LockingLog.Result.FAILURE,
			failure_code="SAMPLE",
			failure_message="Erreur metier test.",
			metadata={},
		)

		self.assertEqual(log.action, LockingLog.Action.UNLOCK)
		self.assertEqual(log.result, LockingLog.Result.FAILURE)
		self.assertIsNotNone(log.created_at)


class VehicleAccessActivationTests(VehicleAccessTestDataMixin, TestCase):
	def test_activation_after_initial_inspection_completed(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)

		access = self._activate_access(reservation)

		self.assertEqual(access.status, VehicleAccess.Status.ACTIVE)
		self.assertTrue(access.is_active)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)
		self.assertIsNotNone(access.activated_at)

	def test_activation_refused_when_initial_inspection_missing(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)

		with self.assertRaises(VehicleAccessLifecycleError) as exc:
			self._activate_access(reservation)

		self.assertEqual(exc.exception.code, "INITIAL_INSPECTION_MISSING")

	def test_activation_refused_when_initial_inspection_not_completed(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		self._create_initial_inspection(reservation, status_value=Inspection.Status.EN_COURS)

		with self.assertRaises(VehicleAccessLifecycleError) as exc:
			self._activate_access(reservation)

		self.assertEqual(exc.exception.code, "INITIAL_NOT_COMPLETED")

	def test_activation_refused_when_critical_issue_exists(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		self._create_initial_inspection(reservation, completed_by=self.client_user_1, critical=True)

		with self.assertRaises(VehicleAccessLifecycleError) as exc:
			self._activate_access(reservation)

		self.assertEqual(exc.exception.code, "CRITICAL_ISSUE_BLOCKING")

	def test_activation_refused_when_reservation_not_en_cours(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)

		with self.assertRaises(VehicleAccessLifecycleError) as exc:
			self._activate_access(reservation)

		self.assertEqual(exc.exception.code, "INVALID_RESERVATION_STATUS")

	def test_activation_creates_access_once_and_log_once(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)

		access_first = self._activate_access(reservation)
		access_second = self._activate_access(reservation)

		self.assertEqual(access_first.pk, access_second.pk)
		self.assertEqual(VehicleAccess.objects.filter(reservation=reservation).count(), 1)
		self.assertEqual(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.ACCESS_ACTIVATED,
				result=LockingLog.Result.SUCCESS,
			).count(),
			1,
		)


class VehicleAccessUnlockServiceTests(VehicleAccessTestDataMixin, TestCase):
	def _prepare_active_access(self, *, reservation=None, user=None):
		reservation = reservation or self._create_reservation(status=Reservation.Status.EN_COURS)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		self._create_initial_inspection(reservation, completed_by=user or reservation.client.user)
		return reservation, self._activate_access(reservation, requested_by=user or reservation.client.user)

	def _assert_failure_logged(self, *, reservation, code, action=LockingLog.Action.UNLOCK):
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=action,
				result=LockingLog.Result.FAILURE,
				failure_code=code,
			).exists()
		)

	def test_owner_can_unlock_and_state_is_unlocked(self):
		reservation, access = self._prepare_active_access()

		result = unlock_vehicle(
			reservation=reservation,
			requested_by=self.client_user_1,
			request_context={"ip_address": "203.0.113.10", "user_agent": "ClientTest/1.0"},
		)

		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)
		self.assertIsNotNone(access.last_unlocked_at)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.UNLOCK,
				result=LockingLog.Result.SUCCESS,
			).exists()
		)

	def test_other_client_is_refused_and_not_owner_logged(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_2)

		self.assertEqual(exc.exception.code, "NOT_OWNER")
		self._assert_failure_logged(reservation=reservation, code="NOT_OWNER")

	def test_anonymous_is_refused(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=None)

		self.assertEqual(exc.exception.code, "UNAUTHENTICATED")

	def test_manager_is_refused(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.manager_user)

		self.assertEqual(exc.exception.code, "INVALID_ROLE")

	def test_unlock_refused_when_reservation_not_en_cours(self):
		reservation, _access = self._prepare_active_access()
		reservation.status = Reservation.Status.CONFIRMEE
		reservation.save(update_fields=["status", "updated_at"])

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "INVALID_RESERVATION_STATUS")
		self._assert_failure_logged(reservation=reservation, code="INVALID_RESERVATION_STATUS")

	def test_unlock_refused_when_initial_inspection_missing(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		now = timezone.now()
		VehicleAccess.objects.create(
			reservation=reservation,
			vehicle=reservation.vehicle,
			client=reservation.client.user,
			status=VehicleAccess.Status.ACTIVE,
			lock_state=VehicleAccess.LockState.LOCKED,
			valid_from=now - timedelta(hours=1),
			valid_until=now + timedelta(hours=2),
			is_active=True,
		)

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "INITIAL_INSPECTION_REQUIRED")
		self._assert_failure_logged(reservation=reservation, code="INITIAL_INSPECTION_REQUIRED")

	def test_unlock_refused_when_initial_inspection_not_completed(self):
		reservation, access = self._prepare_active_access()
		inspection = reservation.inspections.get(inspection_type=Inspection.Type.INITIAL)
		inspection.status = Inspection.Status.EN_COURS
		inspection.completed_at = None
		inspection.save(update_fields=["status", "completed_at", "updated_at"])

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(exc.exception.code, "INITIAL_INSPECTION_NOT_COMPLETED")
		self._assert_failure_logged(reservation=reservation, code="INITIAL_INSPECTION_NOT_COMPLETED")

	def test_unlock_refused_on_critical_issue(self):
		reservation, _access = self._prepare_active_access()
		inspection = reservation.inspections.get(inspection_type=Inspection.Type.INITIAL)
		inspection.has_critical_issue = True
		inspection.save(update_fields=["has_critical_issue", "updated_at"])

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "CRITICAL_ISSUE")
		self._assert_failure_logged(reservation=reservation, code="CRITICAL_ISSUE")

	def test_unlock_refused_when_access_absent(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		self._create_initial_inspection(reservation, completed_by=self.client_user_1)

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "ACCESS_NOT_FOUND")
		self._assert_failure_logged(reservation=reservation, code="ACCESS_NOT_FOUND")

	def test_unlock_refused_for_pending_revoked_and_expired_statuses(self):
		reservation, access = self._prepare_active_access()

		access.status = VehicleAccess.Status.PENDING
		access.is_active = True
		access.save(update_fields=["status", "is_active", "updated_at"])
		with self.assertRaises(VehicleAccessError) as pending_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(pending_exc.exception.code, "ACCESS_NOT_STARTED")
		self._assert_failure_logged(reservation=reservation, code="ACCESS_NOT_STARTED")

		VehicleAccess.objects.filter(pk=access.pk).update(
			status=VehicleAccess.Status.REVOKED,
			is_active=False,
			lock_state=VehicleAccess.LockState.LOCKED,
		)
		with self.assertRaises(VehicleAccessError) as revoked_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(revoked_exc.exception.code, "ACCESS_NOT_ACTIVE")

		VehicleAccess.objects.filter(pk=access.pk).update(
			status=VehicleAccess.Status.EXPIRED,
			is_active=True,
			lock_state=VehicleAccess.LockState.LOCKED,
		)
		with self.assertRaises(VehicleAccessError) as expired_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(expired_exc.exception.code, "ACCESS_EXPIRED")
		self._assert_failure_logged(reservation=reservation, code="ACCESS_EXPIRED")

	def test_unlock_refused_when_too_early_or_too_late(self):
		reservation, access = self._prepare_active_access()

		access.valid_from = timezone.now() + timedelta(minutes=30)
		access.valid_until = timezone.now() + timedelta(hours=2)
		access.save(update_fields=["valid_from", "valid_until", "updated_at"])
		with self.assertRaises(VehicleAccessError) as early_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(early_exc.exception.code, "ACCESS_NOT_STARTED")
		self._assert_failure_logged(reservation=reservation, code="ACCESS_NOT_STARTED")

		access.valid_from = timezone.now() - timedelta(hours=3)
		access.valid_until = timezone.now() - timedelta(minutes=1)
		access.save(update_fields=["valid_from", "valid_until", "updated_at"])
		with self.assertRaises(VehicleAccessError) as late_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(late_exc.exception.code, "ACCESS_EXPIRED")

	def test_unlock_refused_for_wrong_vehicle_and_vehicle_not_loue(self):
		reservation, access = self._prepare_active_access()

		VehicleAccess.objects.filter(pk=access.pk).update(vehicle=self.vehicle_2)
		with self.assertRaises(VehicleAccessError) as wrong_vehicle_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(wrong_vehicle_exc.exception.code, "WRONG_VEHICLE")
		self._assert_failure_logged(reservation=reservation, code="WRONG_VEHICLE")

		VehicleAccess.objects.filter(pk=access.pk).update(
			vehicle=reservation.vehicle,
			status=VehicleAccess.Status.ACTIVE,
			is_active=True,
			lock_state=VehicleAccess.LockState.LOCKED,
		)
		reservation.vehicle.status = Vehicle.Status.DISPONIBLE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		with self.assertRaises(VehicleAccessError) as not_rented_exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(not_rented_exc.exception.code, "VEHICLE_NOT_RENTED")
		self._assert_failure_logged(reservation=reservation, code="VEHICLE_NOT_RENTED")

	def test_double_unlock_is_refused_and_failure_logged(self):
		reservation, access = self._prepare_active_access()

		unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(exc.exception.code, "ALREADY_UNLOCKED")
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)
		self._assert_failure_logged(reservation=reservation, code="ALREADY_UNLOCKED")


class VehicleAccessLockServiceTests(VehicleAccessTestDataMixin, TestCase):
	def _prepare_unlocked_access(self, *, status=Reservation.Status.EN_COURS):
		reservation = self._create_reservation(status=status)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.INITIAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		access = activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)
		unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		access.refresh_from_db()
		return reservation, access

	def test_lock_success_sets_locked_state_and_logs_success(self):
		reservation, access = self._prepare_unlocked_access()

		result = lock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.LOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)
		self.assertIsNotNone(access.last_locked_at)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.LOCK,
				result=LockingLog.Result.SUCCESS,
			).exists()
		)

	def test_other_client_is_refused(self):
		reservation, _access = self._prepare_unlocked_access()

		with self.assertRaises(VehicleAccessError) as exc:
			lock_vehicle(reservation=reservation, requested_by=self.client_user_2)

		self.assertEqual(exc.exception.code, "NOT_OWNER")
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.LOCK,
				result=LockingLog.Result.FAILURE,
				failure_code="NOT_OWNER",
			).exists()
		)

	def test_revoked_access_is_refused(self):
		reservation, access = self._prepare_unlocked_access()
		access.status = VehicleAccess.Status.REVOKED
		access.is_active = False
		access.save(update_fields=["status", "is_active", "updated_at"])

		with self.assertRaises(VehicleAccessError) as exc:
			lock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "ACCESS_REVOKED")

	def test_double_lock_is_refused(self):
		reservation, _access = self._prepare_unlocked_access()
		lock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		with self.assertRaises(VehicleAccessError) as exc:
			lock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		self.assertEqual(exc.exception.code, "ALREADY_LOCKED")

	def test_final_lock_after_return_revokes_access_and_logs(self):
		reservation, access = self._prepare_unlocked_access(status=Reservation.Status.EN_COURS)
		reservation.status = Reservation.Status.A_CONTROLER
		reservation.save(update_fields=["status", "updated_at"])

		result = lock_and_revoke_after_return(
			reservation=reservation,
			requested_by=self.client_user_1,
		)

		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.LOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)
		self.assertEqual(access.status, VehicleAccess.Status.REVOKED)
		self.assertFalse(access.is_active)
		self.assertIsNotNone(access.revoked_at)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.ACCESS_REVOKED,
				result=LockingLog.Result.SUCCESS,
			).exists()
		)


class VehicleAccessLoggingAndTransactionTests(VehicleAccessTestDataMixin, TestCase):
	def _prepare_active_access(self):
		reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.INITIAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
		access = activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)
		return reservation, access

	def test_failure_log_is_created_for_authenticated_business_error(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError):
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_2)

		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				result=LockingLog.Result.FAILURE,
				failure_code="NOT_OWNER",
				action=LockingLog.Action.UNLOCK,
			).exists()
		)

	def test_logs_do_not_contain_authorization_or_secrets(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError):
			unlock_vehicle(
				reservation=reservation,
				requested_by=self.client_user_2,
				request_context={
					"headers": {
						"Authorization": "Bearer secret-token-value",
						"User-Agent": "TestUA/1.0",
					},
					"ip_address": "203.0.113.20",
				},
			)

		forbidden_fragments = [
			"authorization",
			"bearer",
			"jwt",
			"password",
			"stripe_secret",
			"card_number",
			"iban",
			"cvv",
		]
		for log in LockingLog.objects.all():
			payload = " ".join(
				[
					str(log.failure_code or ""),
					str(log.failure_message or ""),
					str(log.metadata or ""),
					str(log.user_agent or ""),
				]
			).lower()
			for fragment in forbidden_fragments:
				self.assertNotIn(fragment, payload)

	def test_transaction_rolls_back_partial_state_on_unexpected_error(self):
		reservation, access = self._prepare_active_access()
		unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		access.refresh_from_db()
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)

		from unittest.mock import patch

		with patch("interventions.services.vehicle_access.LockingLog.objects.create", side_effect=RuntimeError("log failure")):
			with self.assertRaises(RuntimeError):
				lock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)

	def test_failure_log_survives_business_rule_rollback(self):
		reservation, access = self._prepare_active_access()
		pre_lock_state = access.lock_state

		with self.assertRaises(VehicleAccessError):
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_2)

		access.refresh_from_db()
		self.assertEqual(access.lock_state, pre_lock_state)
		self.assertTrue(
			LockingLog.objects.filter(
				reservation=reservation,
				action=LockingLog.Action.UNLOCK,
				result=LockingLog.Result.FAILURE,
				failure_code="NOT_OWNER",
			).exists()
		)


class VehicleAccessApiTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _prepare_active_access(self, *, client_profile=None):
		reservation = self._create_reservation(
			client=client_profile or self.client_profile_1,
			status=Reservation.Status.EN_COURS,
			start_at=timezone.now() - timedelta(hours=1),
			end_at=timezone.now() + timedelta(hours=3),
		)
		reservation.vehicle.status = Vehicle.Status.LOUE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.INITIAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=reservation.client.user,
		)
		activate_vehicle_access(reservation=reservation, requested_by=reservation.client.user)
		return reservation

	def test_urls_exactes(self):
		self.assertEqual(
			reverse("reservations:reservation-unlock", kwargs={"pk": 1}),
			"/api/v1/reservations/1/unlock/",
		)
		self.assertEqual(
			reverse("reservations:reservation-lock", kwargs={"pk": 1}),
			"/api/v1/reservations/1/lock/",
		)

	def test_unlock_and_lock_return_200(self):
		reservation = self._prepare_active_access()
		self.client_api.force_authenticate(self.client_user_1)

		unlock_response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

		lock_response = self.client_api.post(
			reverse("reservations:reservation-lock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(lock_response.status_code, status.HTTP_200_OK)

	def test_unlock_returns_401_for_anonymous(self):
		reservation = self._prepare_active_access()

		response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_unlock_returns_403_for_forbidden_role(self):
		reservation = self._prepare_active_access()
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_unlock_returns_404_for_foreign_reservation_without_sensitive_data(self):
		reservation = self._prepare_active_access(client_profile=self.client_profile_2)
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.assertEqual(response.data["code"], "NOT_OWNER")
		self.assertNotIn("reference", response.data)
		self.assertNotIn("vehicle", response.data)

	def test_unlock_returns_409_for_double_unlock(self):
		reservation = self._prepare_active_access()
		self.client_api.force_authenticate(self.client_user_1)

		first = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(first.status_code, status.HTTP_200_OK)

		second = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			format="json",
		)
		self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(second.data["code"], "ALREADY_UNLOCKED")

	def test_unlock_rejects_vehicle_id_from_frontend(self):
		reservation = self._prepare_active_access()
		self.client_api.force_authenticate(self.client_user_1)

		response = self.client_api.post(
			reverse("reservations:reservation-unlock", kwargs={"pk": reservation.id}),
			{"vehicle_id": self.vehicle_1.id},
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("vehicle_id", response.data)


class LockingLogAdminTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.factory = RequestFactory()
		self.admin_instance = LockingLogAdmin(LockingLog, admin.site)

	def test_locking_log_admin_is_registered_and_read_only(self):
		self.assertIn(LockingLog, admin.site._registry)
		request = self.factory.get("/admin/interventions/lockinglog/")
		request.user = self.admin_user

		self.assertTrue(self.admin_instance.has_view_permission(request))
		self.assertFalse(self.admin_instance.has_add_permission(request))
		self.assertFalse(self.admin_instance.has_change_permission(request))
		self.assertFalse(self.admin_instance.has_delete_permission(request))

