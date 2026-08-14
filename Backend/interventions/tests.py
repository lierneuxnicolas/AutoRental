from datetime import timedelta
from decimal import Decimal
import os
import tempfile

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.conf import settings
from django.core import mail
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError
from django.test import RequestFactory, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientProfile, Role
from inspections.models import Inspection
from interventions.admin import LockingLogAdmin
from interventions.models import Intervention, LockingLog, TechnicalInspection, TechnicalPhoto, VehicleAccess
from interventions.services import assign_intervention
from interventions.services.assignment import InterventionAssignmentError
from interventions.services.workflow import InterventionWorkflowServiceError, complete_intervention
from interventions.services.vehicle_access import (
	VehicleAccessError,
	VehicleAccessLifecycleError,
	activate_vehicle_access,
	lock_and_revoke_after_return,
	lock_vehicle,
	unlock_vehicle,
)
from notifications.models import Notification
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class VehicleAccessTestDataMixin:
	@classmethod
	def setUpTestData(cls):
		User = get_user_model()

		cls.role_client = Role.objects.create(code=Role.Code.CLIENT, label="Client")
		cls.role_manager = Role.objects.create(code=Role.Code.GESTIONNAIRE_COMPTABLE, label="Gestionnaire")
		cls.role_admin = Role.objects.create(code=Role.Code.ADMINISTRATEUR, label="Administrateur")
		cls.role_mechanic = Role.objects.create(code=Role.Code.MECANICIEN, label="Mecanicien")
		cls.role_cleaner = Role.objects.create(code=Role.Code.NETTOYEUR, label="Nettoyeur")

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
		cls.mechanic_user_1 = User.objects.create_user(
			email="ia-mechanic-1@example.com",
			password="Pass1234!",
			first_name="Mec",
			last_name="One",
			phone="0400000105",
			role=cls.role_mechanic,
			email_verified=True,
		)
		cls.mechanic_user_2 = User.objects.create_user(
			email="ia-mechanic-2@example.com",
			password="Pass1234!",
			first_name="Mec",
			last_name="Two",
			phone="0400000106",
			role=cls.role_mechanic,
			email_verified=True,
		)
		cls.cleaner_user_1 = User.objects.create_user(
			email="ia-cleaner-1@example.com",
			password="Pass1234!",
			first_name="Clean",
			last_name="One",
			phone="0400000107",
			role=cls.role_cleaner,
			email_verified=True,
		)
		cls.cleaner_user_2 = User.objects.create_user(
			email="ia-cleaner-2@example.com",
			password="Pass1234!",
			first_name="Clean",
			last_name="Two",
			phone="0400000108",
			role=cls.role_cleaner,
			email_verified=True,
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

	def _create_intervention(
		self,
		*,
		intervention_type=Intervention.Type.MECANIQUE,
		status_value=Intervention.Status.A_ATTRIBUER,
		vehicle=None,
		reservation=None,
		assigned_to=None,
		report="",
		final_cost=None,
		started_at=None,
	):
		reference = f"INT-TEST-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"
		if status_value in (Intervention.Status.EN_COURS, Intervention.Status.TERMINEE) and started_at is None:
			started_at = timezone.now()
		return Intervention.objects.create(
			reference=reference,
			vehicle=vehicle or self.vehicle_1,
			reservation=reservation,
			assigned_to=assigned_to,
			created_by=self.manager_user,
			intervention_type=intervention_type,
			status=status_value,
			report=report,
			final_cost=final_cost,
			started_at=started_at,
		)

	@staticmethod
	def _image_file(name="test-photo.gif"):
		return SimpleUploadedFile(
			name,
			(
				b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
				b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
				b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
			),
			content_type="image/gif",
		)

	@staticmethod
	def _temporary_image_file(name="test-photo.gif"):
		content = (
			b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
			b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
			b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
		)
		with tempfile.NamedTemporaryFile(suffix=".gif") as temp_file:
			temp_file.write(content)
			temp_file.flush()
			temp_file.seek(0)
			return SimpleUploadedFile(name, temp_file.read(), content_type="image/gif")


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
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)

		access = self._activate_access(reservation)

		self.assertEqual(access.status, VehicleAccess.Status.ACTIVE)
		self.assertTrue(access.is_active)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)
		self.assertIsNotNone(access.activated_at)

	def test_activation_refused_when_initial_inspection_missing(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)

		access = self._activate_access(reservation)
		self.assertEqual(access.status, VehicleAccess.Status.ACTIVE)

	def test_activation_refused_when_initial_inspection_not_completed(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)

		access = self._activate_access(reservation)
		self.assertEqual(access.status, VehicleAccess.Status.ACTIVE)

	def test_activation_refused_when_critical_issue_exists(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)

		access = self._activate_access(reservation)
		self.assertEqual(access.status, VehicleAccess.Status.ACTIVE)

	def test_activation_refused_when_reservation_not_en_cours(self):
		reservation = self._create_reservation(status=Reservation.Status.BROUILLON)

		with self.assertRaises(VehicleAccessLifecycleError) as exc:
			self._activate_access(reservation)

		self.assertEqual(exc.exception.code, "INVALID_RESERVATION_STATUS")

	def test_activation_creates_access_once_and_log_once(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)

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

		with self.captureOnCommitCallbacks(execute=True):
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
		self.assertEqual(len(mail.outbox), 1)
		email = mail.outbox[0]
		self.assertEqual(email.subject, "Votre location GetACar a commencé")
		self.assertEqual(email.from_email, settings.DEFAULT_FROM_EMAIL)
		self.assertEqual(email.to, [self.client_user_1.email])
		self.assertIn(f"Référence : {reservation.reference}", email.body)
		self.assertIn("Votre location GetACar a bien commencé.", email.body)
		self.assertEqual(
			Notification.objects.filter(
				user=self.client_user_1,
				notification_type="RESERVATION_STARTED",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).count(),
			1,
		)

	def test_other_client_is_refused_and_not_owner_logged(self):
		reservation, _access = self._prepare_active_access()

		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_2)

		self.assertEqual(exc.exception.code, "NOT_OWNER")
		self._assert_failure_logged(reservation=reservation, code="NOT_OWNER")
		self.assertEqual(len(mail.outbox), 0)
		self.assertFalse(
			Notification.objects.filter(
				user=self.client_user_1,
				notification_type="RESERVATION_STARTED",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).exists()
		)

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

		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)

	def test_unlock_refused_when_initial_inspection_missing(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
		reservation.vehicle.status = Vehicle.Status.RESERVE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		access = activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)
		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)

	def test_unlock_refused_when_initial_inspection_not_completed(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
		reservation.vehicle.status = Vehicle.Status.RESERVE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		access = activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)

		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)

	def test_unlock_refused_on_critical_issue(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
		reservation.vehicle.status = Vehicle.Status.RESERVE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		access = activate_vehicle_access(reservation=reservation, requested_by=self.client_user_1)
		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		access.refresh_from_db()
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)

	def test_unlock_refused_when_access_absent(self):
		reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
		reservation.vehicle.status = Vehicle.Status.RESERVE
		reservation.vehicle.save(update_fields=["status", "updated_at"])
		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)
		self.assertTrue(VehicleAccess.objects.filter(reservation=reservation).exists())

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
		result = unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(result["state"], VehicleAccess.LockState.UNLOCKED)

	def test_double_unlock_is_refused_and_failure_logged(self):
		reservation, access = self._prepare_active_access()

		with self.captureOnCommitCallbacks(execute=True):
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)
		self.assertEqual(len(mail.outbox), 1)
		self.assertEqual(
			Notification.objects.filter(
				user=self.client_user_1,
				notification_type="RESERVATION_STARTED",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).count(),
			1,
		)
		with self.assertRaises(VehicleAccessError) as exc:
			unlock_vehicle(reservation=reservation, requested_by=self.client_user_1)

		access.refresh_from_db()
		self.assertEqual(exc.exception.code, "ALREADY_UNLOCKED")
		self.assertEqual(access.lock_state, VehicleAccess.LockState.UNLOCKED)
		self._assert_failure_logged(reservation=reservation, code="ALREADY_UNLOCKED")
		self.assertEqual(len(mail.outbox), 1)
		self.assertEqual(
			Notification.objects.filter(
				user=self.client_user_1,
				notification_type="RESERVATION_STARTED",
				related_object_type="reservation",
				related_object_id=reservation.id,
			).count(),
			1,
		)


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
		Inspection.objects.create(
			reservation=reservation,
			inspection_type=Inspection.Type.FINAL,
			status=Inspection.Status.TERMINE,
			completed_at=timezone.now(),
			completed_by=self.client_user_1,
		)
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


class InterventionModelTests(VehicleAccessTestDataMixin, TestCase):
	def test_creation_intervention(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)

		self.assertEqual(intervention.created_by, self.manager_user)
		self.assertEqual(intervention.status, Intervention.Status.A_ATTRIBUER)
		self.assertEqual(intervention.intervention_type, Intervention.Type.MECANIQUE)

	def test_creation_technical_inspection(self):
		intervention = self._create_intervention(
			intervention_type=Intervention.Type.MECANIQUE,
			status_value=Intervention.Status.EN_COURS,
			assigned_to=self.mechanic_user_1,
		)
		technical_inspection = TechnicalInspection.objects.create(
			intervention=intervention,
			vehicle=intervention.vehicle,
			mileage=1540,
			energy_level_percent=68,
			observations="Controle visuel avant cloture.",
		)

		self.assertEqual(technical_inspection.intervention_id, intervention.id)
		self.assertEqual(technical_inspection.vehicle_id, intervention.vehicle_id)
		self.assertEqual(technical_inspection.energy_level_percent, 68)

	def test_creation_technical_photo(self):
		intervention = self._create_intervention(
			intervention_type=Intervention.Type.MECANIQUE,
			status_value=Intervention.Status.EN_COURS,
			assigned_to=self.mechanic_user_1,
		)
		technical_inspection = TechnicalInspection.objects.create(
			intervention=intervention,
			vehicle=intervention.vehicle,
			mileage=1540,
			energy_level_percent=68,
		)
		photo = TechnicalPhoto.objects.create(
			technical_inspection=technical_inspection,
			file=self._image_file("model-photo.gif"),
			caption="Photo modele",
		)

		self.assertEqual(photo.technical_inspection_id, technical_inspection.id)
		self.assertEqual(photo.caption, "Photo modele")


class InterventionAssignmentTests(VehicleAccessTestDataMixin, TestCase):
	def test_assign_mechanic_accepted_for_mechanical_intervention(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)

		assign_intervention(
			intervention=intervention,
			assigned_user_id=self.mechanic_user_1.id,
			manager=self.manager_user,
		)
		intervention.refresh_from_db()

		self.assertEqual(intervention.assigned_to_id, self.mechanic_user_1.id)
		self.assertEqual(intervention.status, Intervention.Status.ATTRIBUEE)

	def test_assign_cleaner_accepted_for_cleaning_intervention(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.NETTOYAGE)

		assign_intervention(
			intervention=intervention,
			assigned_user_id=self.cleaner_user_1.id,
			manager=self.manager_user,
		)
		intervention.refresh_from_db()

		self.assertEqual(intervention.assigned_to_id, self.cleaner_user_1.id)
		self.assertEqual(intervention.status, Intervention.Status.ATTRIBUEE)

	def test_assign_wrong_role_refused(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)

		with self.assertRaises(InterventionAssignmentError) as exc:
			assign_intervention(
				intervention=intervention,
				assigned_user_id=self.cleaner_user_1.id,
				manager=self.manager_user,
			)

		self.assertEqual(exc.exception.code, "INVALID_ASSIGNEE_ROLE")


class InterventionManagementApiTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def test_manager_create_intervention(self):
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.post(
			"/api/v1/management/interventions/",
			{
				"vehicle_id": self.vehicle_1.id,
				"type": Intervention.Type.MECANIQUE,
				"description": "Controle freinage",
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Intervention.objects.count(), 1)
		created = Intervention.objects.get()
		self.assertEqual(created.created_by_id, self.manager_user.id)

	def test_manager_assign_intervention(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)
		self.client_api.force_authenticate(self.manager_user)

		with self.captureOnCommitCallbacks(execute=True):
			response = self.client_api.patch(
				f"/api/v1/management/interventions/{intervention.id}/assign/",
				{"assigned_user_id": self.mechanic_user_1.id},
				format="json",
			)

		intervention.refresh_from_db()
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(intervention.assigned_to_id, self.mechanic_user_1.id)
		self.assertEqual(intervention.status, Intervention.Status.ATTRIBUEE)

	def test_manager_list_interventions(self):
		self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)
		self._create_intervention(intervention_type=Intervention.Type.NETTOYAGE)
		self.client_api.force_authenticate(self.manager_user)

		response = self.client_api.get("/api/v1/management/interventions/")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 2)


class MechanicInterventionApiTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _assigned_mechanic_intervention(self, *, assigned_to=None, status_value=Intervention.Status.ATTRIBUEE):
		return self._create_intervention(
			intervention_type=Intervention.Type.MECANIQUE,
			status_value=status_value,
			assigned_to=assigned_to or self.mechanic_user_1,
		)

	def test_mechanic_sees_only_his_interventions(self):
		mine = self._assigned_mechanic_intervention(assigned_to=self.mechanic_user_1)
		self._assigned_mechanic_intervention(assigned_to=self.mechanic_user_2)
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.get("/api/v1/mechanic/interventions/")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		returned_ids = {item["id"] for item in response.data}
		self.assertEqual(returned_ids, {mine.id})

	def test_mechanic_start_intervention(self):
		intervention = self._assigned_mechanic_intervention(status_value=Intervention.Status.ATTRIBUEE)
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.post(f"/api/v1/mechanic/interventions/{intervention.id}/start/", format="json")

		intervention.refresh_from_db()
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(intervention.status, Intervention.Status.EN_COURS)
		self.assertIsNotNone(intervention.started_at)

	def test_mechanic_add_photo(self):
		intervention = self._assigned_mechanic_intervention(status_value=Intervention.Status.EN_COURS)
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.post(
			f"/api/v1/mechanic/interventions/{intervention.id}/photos/",
			{"file": self._image_file("mechanic-photo.gif"), "caption": "Avant intervention"},
			format="multipart",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(
			TechnicalPhoto.objects.filter(
				technical_inspection__intervention=intervention,
				caption="Avant intervention",
			).exists()
		)

	def test_mechanic_photo_upload_schema_and_multipart_request(self):
		intervention = self._assigned_mechanic_intervention(status_value=Intervention.Status.EN_COURS)
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.post(
			f"/api/v1/mechanic/interventions/{intervention.id}/photos/",
			{"file": self._temporary_image_file("mechanic-schema.gif"), "caption": "Controle schema"},
			format="multipart",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		with tempfile.NamedTemporaryFile(mode="r", encoding="utf-8", suffix=".yml", delete=False) as schema_file:
			schema_path = schema_file.name

		try:
			call_command("spectacular", "--file", schema_path)
			with open(schema_path, "r", encoding="utf-8") as generated_schema:
				schema = generated_schema.read()
		finally:
			if os.path.exists(schema_path):
				os.remove(schema_path)

		self.assertIn("/api/v1/mechanic/interventions/{id}/photos/:", schema)
		self.assertIn("/api/v1/cleaning/interventions/{id}/photos/:", schema)
		self.assertIn("InterventionWorkerPhotoUploadRequestRequest:", schema)
		self.assertIn("format: binary", schema)

	def test_mechanic_close_intervention(self):
		intervention = self._assigned_mechanic_intervention(status_value=Intervention.Status.EN_COURS)
		intervention.started_at = timezone.now() - timedelta(minutes=30)
		intervention.save(update_fields=["started_at", "updated_at"])
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.post(
			f"/api/v1/mechanic/interventions/{intervention.id}/complete/",
			{"report": "Intervention terminee"},
			format="json",
		)

		intervention.refresh_from_db()
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(intervention.status, Intervention.Status.TERMINEE)
		self.assertEqual(intervention.report, "Intervention terminee")
		self.assertIsNotNone(intervention.started_at)


class CleaningInterventionApiTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def _assigned_cleaning_intervention(self, *, assigned_to=None, status_value=Intervention.Status.ATTRIBUEE):
		return self._create_intervention(
			intervention_type=Intervention.Type.NETTOYAGE,
			status_value=status_value,
			assigned_to=assigned_to or self.cleaner_user_1,
		)

	def test_cleaner_sees_only_his_interventions(self):
		mine = self._assigned_cleaning_intervention(assigned_to=self.cleaner_user_1)
		self._assigned_cleaning_intervention(assigned_to=self.cleaner_user_2)
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.get("/api/v1/cleaning/interventions/")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		returned_ids = {item["id"] for item in response.data}
		self.assertEqual(returned_ids, {mine.id})

	def test_cleaner_start_intervention(self):
		intervention = self._assigned_cleaning_intervention(status_value=Intervention.Status.ATTRIBUEE)
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.post(f"/api/v1/cleaning/interventions/{intervention.id}/start/", format="json")

		intervention.refresh_from_db()
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(intervention.status, Intervention.Status.EN_COURS)
		self.assertIsNotNone(intervention.started_at)

	def test_cleaner_add_photo(self):
		intervention = self._assigned_cleaning_intervention(status_value=Intervention.Status.EN_COURS)
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.post(
			f"/api/v1/cleaning/interventions/{intervention.id}/photos/",
			{"file": self._image_file("cleaning-photo.gif"), "caption": "Apres nettoyage"},
			format="multipart",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(
			TechnicalPhoto.objects.filter(
				technical_inspection__intervention=intervention,
				caption="Apres nettoyage",
			).exists()
		)

	def test_cleaner_photo_upload_accepts_multipart_image(self):
		intervention = self._assigned_cleaning_intervention(status_value=Intervention.Status.EN_COURS)
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.post(
			f"/api/v1/cleaning/interventions/{intervention.id}/photos/",
			{"file": self._temporary_image_file("cleaning-schema.gif"), "caption": "Controle nettoyage"},
			format="multipart",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

	def test_cleaner_close_intervention(self):
		intervention = self._assigned_cleaning_intervention(status_value=Intervention.Status.EN_COURS)
		intervention.started_at = timezone.now() - timedelta(minutes=30)
		intervention.save(update_fields=["started_at", "updated_at"])
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.post(
			f"/api/v1/cleaning/interventions/{intervention.id}/complete/",
			{"report": "Nettoyage termine"},
			format="json",
		)

		intervention.refresh_from_db()
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(intervention.status, Intervention.Status.TERMINEE)
		self.assertEqual(intervention.report, "Nettoyage termine")
		self.assertIsNotNone(intervention.started_at)


class InterventionWorkflowServiceTests(VehicleAccessTestDataMixin, TestCase):
	def _prepare_in_progress_intervention_with_active_access(self):
		reservation = self._create_reservation(
			client=self.client_profile_1,
			vehicle=self.vehicle_1,
			status=Reservation.Status.EN_COURS,
		)
		intervention = self._create_intervention(
			intervention_type=Intervention.Type.MECANIQUE,
			status_value=Intervention.Status.EN_COURS,
			assigned_to=self.mechanic_user_1,
			vehicle=self.vehicle_1,
			reservation=reservation,
		)
		now = timezone.now()
		VehicleAccess.objects.create(
			reservation=reservation,
			vehicle=self.vehicle_1,
			client=self.client_user_1,
			status=VehicleAccess.Status.ACTIVE,
			lock_state=VehicleAccess.LockState.UNLOCKED,
			valid_from=now - timedelta(hours=1),
			valid_until=now + timedelta(hours=2),
			is_active=True,
		)
		self.vehicle_1.status = Vehicle.Status.LOUE
		self.vehicle_1.save(update_fields=["status", "updated_at"])
		return intervention

	def test_workflow_report_required(self):
		intervention = self._prepare_in_progress_intervention_with_active_access()

		with self.assertRaises(InterventionWorkflowServiceError) as exc:
			complete_intervention(
				intervention=intervention,
				report="   ",
				photos=[{"file": self._image_file("workflow-photo.gif")}],
			)

		self.assertEqual(exc.exception.code, "REPORT_REQUIRED")

	def test_workflow_records_final_cost(self):
		intervention = self._prepare_in_progress_intervention_with_active_access()

		with self.captureOnCommitCallbacks(execute=True):
			complete_intervention(
				intervention=intervention,
				report="Intervention validee et cloturee.",
				final_cost=Decimal("149.90"),
				inspection_mileage=1555,
				inspection_energy_level_percent=75,
				inspection_observations="RAS",
				photos=[{"file": self._image_file("workflow-cost.gif"), "caption": "Photo cout"}],
			)

		intervention.refresh_from_db()
		self.assertEqual(intervention.final_cost, Decimal("149.90"))

	def test_workflow_creates_notification_for_manager(self):
		intervention = self._prepare_in_progress_intervention_with_active_access()

		with self.captureOnCommitCallbacks(execute=True):
			complete_intervention(
				intervention=intervention,
				report="Intervention terminee avec validation requise.",
				photos=[{"file": self._image_file("workflow-notif.gif"), "caption": "Photo notif"}],
			)

		self.assertTrue(
			Notification.objects.filter(
				user=self.manager_user,
				notification_type="INTERVENTION_COMPLETED_REVIEW_REQUIRED",
				related_object_type="Intervention",
				related_object_id=intervention.id,
			).exists()
		)

	def test_workflow_disables_vehicle_access(self):
		intervention = self._prepare_in_progress_intervention_with_active_access()

		with self.captureOnCommitCallbacks(execute=True):
			complete_intervention(
				intervention=intervention,
				report="Intervention terminee.",
				photos=[{"file": self._image_file("workflow-access.gif"), "caption": "Photo access"}],
			)

		access = VehicleAccess.objects.get(reservation=intervention.reservation)
		self.assertFalse(access.is_active)
		self.assertEqual(access.status, VehicleAccess.Status.PENDING)
		self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)

	def test_workflow_keeps_vehicle_status_a_controler(self):
		intervention = self._prepare_in_progress_intervention_with_active_access()

		with self.captureOnCommitCallbacks(execute=True):
			complete_intervention(
				intervention=intervention,
				report="Vehicule en attente de controle.",
				photos=[{"file": self._image_file("workflow-vehicle.gif"), "caption": "Photo vehicule"}],
			)

		intervention.vehicle.refresh_from_db()
		self.assertEqual(intervention.vehicle.status, Vehicle.Status.A_CONTROLER)


class InterventionSecurityApiTests(VehicleAccessTestDataMixin, TestCase):
	def setUp(self):
		self.client_api = APIClient()

	def test_mechanic_cannot_access_other_mechanic_intervention(self):
		other = self._create_intervention(
			intervention_type=Intervention.Type.MECANIQUE,
			status_value=Intervention.Status.ATTRIBUEE,
			assigned_to=self.mechanic_user_2,
		)
		self.client_api.force_authenticate(self.mechanic_user_1)

		response = self.client_api.get(f"/api/v1/mechanic/interventions/{other.id}/")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_cleaner_cannot_access_other_cleaner_intervention(self):
		other = self._create_intervention(
			intervention_type=Intervention.Type.NETTOYAGE,
			status_value=Intervention.Status.ATTRIBUEE,
			assigned_to=self.cleaner_user_2,
		)
		self.client_api.force_authenticate(self.cleaner_user_1)

		response = self.client_api.get(f"/api/v1/cleaning/interventions/{other.id}/")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_client_cannot_access_any_intervention_endpoint(self):
		intervention = self._create_intervention(intervention_type=Intervention.Type.MECANIQUE)
		self.client_api.force_authenticate(self.client_user_1)

		responses = [
			self.client_api.get("/api/v1/management/interventions/"),
			self.client_api.post(
				"/api/v1/management/interventions/",
				{"vehicle_id": self.vehicle_1.id, "type": Intervention.Type.MECANIQUE},
				format="json",
			),
			self.client_api.patch(
				f"/api/v1/management/interventions/{intervention.id}/assign/",
				{"assigned_user_id": self.mechanic_user_1.id},
				format="json",
			),
			self.client_api.get("/api/v1/mechanic/interventions/"),
			self.client_api.post(f"/api/v1/mechanic/interventions/{intervention.id}/start/", format="json"),
			self.client_api.post(
				f"/api/v1/mechanic/interventions/{intervention.id}/photos/",
				{"file": self._image_file("security-mechanic.gif")},
				format="multipart",
			),
			self.client_api.post(
				f"/api/v1/mechanic/interventions/{intervention.id}/complete/",
				{"report": "No access"},
				format="json",
			),
			self.client_api.get("/api/v1/cleaning/interventions/"),
			self.client_api.post(f"/api/v1/cleaning/interventions/{intervention.id}/start/", format="json"),
			self.client_api.post(
				f"/api/v1/cleaning/interventions/{intervention.id}/photos/",
				{"file": self._image_file("security-cleaning.gif")},
				format="multipart",
			),
			self.client_api.post(
				f"/api/v1/cleaning/interventions/{intervention.id}/complete/",
				{"report": "No access"},
				format="json",
			),
		]

		for response in responses:
			self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

