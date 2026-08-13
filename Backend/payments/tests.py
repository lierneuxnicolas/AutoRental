from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import stripe
from django.conf import settings
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile, Role
from common.models import SystemLog
from invoicing.models import Invoice
from accounts.tests.utils import create_user, ensure_roles
from notifications.models import Notification
from payments.services.deposits import DepositAuthorizationError, authorize_deposit
from payments.models import Deposit, Payment, StripeEvent
from payments.services.webhooks import InvoiceIntegrationPending, process_stripe_event
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class PaymentsModelValidationTests(TestCase):
	def setUp(self):
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="model-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1990, 1, 1),
			address="Rue Models 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		self.brand = Brand.objects.create(name="Model Brand", is_active=True)
		self.category = VehicleCategory.objects.create(
			name="Model Category",
			description="Model tests",
			daily_rate=Decimal("80.00"),
			hourly_rate=Decimal("12.00"),
			minimum_deposit=Decimal("350.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		self.parking = Parking.objects.create(name="Model Parking", address="Rue Parking", capacity=10, is_active=True)
		self.parking_space = ParkingSpace.objects.create(parking=self.parking, number="M1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=self.brand,
			category=self.category,
			parking_space=self.parking_space,
			registration_number="MOD-001",
			model_name="Model",
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
		start_at = timezone.now() + timedelta(days=2)
		end_at = start_at + timedelta(days=2)
		self.reservation = Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=start_at,
			end_at=end_at,
			status=Reservation.Status.BROUILLON,
			rental_amount=Decimal("100.00"),
			deposit_amount=Decimal("350.00"),
		)

	def test_payment_amount_must_be_non_negative(self):
		with self.assertRaises(IntegrityError):
			Payment.objects.create(
				reservation=self.reservation,
				provider=Payment.Provider.STRIPE,
				amount=Decimal("-1.00"),
				currency="EUR",
			)

	def test_deposit_amount_must_be_non_negative(self):
		with self.assertRaises(IntegrityError):
			Deposit.objects.create(
				reservation=self.reservation,
				mode=Deposit.Mode.SIMULATED,
				amount=Decimal("-0.01"),
				currency="EUR",
			)

	def test_payment_stripe_payment_intent_id_is_unique(self):
		Payment.objects.create(
			reservation=self.reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("10.00"),
			currency="EUR",
			stripe_payment_intent_id="pi_unique_model",
		)

		with self.assertRaises(IntegrityError):
			Payment.objects.create(
				reservation=self.reservation,
				provider=Payment.Provider.STRIPE,
				amount=Decimal("11.00"),
				currency="EUR",
				stripe_payment_intent_id="pi_unique_model",
			)

	def test_stripe_event_id_is_unique(self):
		StripeEvent.objects.create(
			stripe_event_id="evt_unique",
			event_type="payment_intent.succeeded",
			payload={"id": "evt_unique", "type": "payment_intent.succeeded"},
		)

		with self.assertRaises(IntegrityError):
			StripeEvent.objects.create(
				stripe_event_id="evt_unique",
				event_type="payment_intent.payment_failed",
				payload={"id": "evt_unique", "type": "payment_intent.payment_failed"},
			)

	def test_payment_status_choices_are_exact(self):
		expected = {
			"CREE",
			"EN_ATTENTE",
			"ACTION_REQUISE",
			"TRAITEMENT",
			"REUSSI",
			"ECHOUE",
			"ANNULE",
		}
		self.assertEqual({value for value, _ in Payment.Status.choices}, expected)

	def test_models_do_not_have_bank_card_fields(self):
		for model in (Payment, Deposit, StripeEvent):
			field_names = {field.name for field in model._meta.get_fields()}
			for forbidden in ["card_number", "cvc", "expiry", "pin", "secret_key"]:
				self.assertNotIn(forbidden, field_names)


class StripeWebhookBusinessProcessingTests(TestCase):
	def setUp(self):
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="stripe-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.manager_user = create_user(
			email="manager@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
			email_verified=True,
			is_active=True,
		)

		self.profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1990, 1, 1),
			address="Rue Test 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)

		end_date = timezone.localdate() + timedelta(days=15)
		for document_type in (
			ClientDocument.DocumentType.CARTE_IDENTITE,
			ClientDocument.DocumentType.PERMIS_CONDUIRE,
		):
			ClientDocument.objects.create(
				client=self.profile,
				document_type=document_type,
				document_number=f"DOC-{document_type}",
				file="client_documents/test.pdf",
				expiration_date=end_date + timedelta(days=30),
				status=ClientDocument.Status.VALIDE,
				is_active=True,
			)

		self.brand = Brand.objects.create(name="Stripe Brand", is_active=True)
		self.category = VehicleCategory.objects.create(
			name="Stripe Category",
			description="Category",
			daily_rate=Decimal("50.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		self.parking = Parking.objects.create(
			name="Stripe Parking",
			address="Rue Parking 1",
			capacity=10,
			is_active=True,
		)
		self.parking_space = ParkingSpace.objects.create(parking=self.parking, number="A1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=self.brand,
			category=self.category,
			parking_space=self.parking_space,
			registration_number="STR-001",
			model_name="Model",
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

		self.start_at = timezone.now() + timedelta(days=10)
		self.end_at = self.start_at + timedelta(days=3)
		self.reservation = Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=self.start_at,
			end_at=self.end_at,
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("300.00"),
		)
		self.payment = Payment.objects.create(
			reservation=self.reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("120.00"),
			currency="EUR",
			status=Payment.Status.EN_ATTENTE,
			stripe_payment_intent_id="pi_test_123",
		)
		self.deposit = Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.STRIPE_TEST,
			amount=Decimal("300.00"),
			currency="EUR",
			status=Deposit.Status.CREE,
		)

	def _build_event(self, event_id, event_type, **object_overrides):
		amount_minor = int((self.payment.amount * Decimal("100")).quantize(Decimal("1")))
		payment_intent = {
			"id": self.payment.stripe_payment_intent_id,
			"amount": amount_minor,
			"amount_received": amount_minor,
			"currency": self.payment.currency.lower(),
			"metadata": {
				"reservation_id": str(self.reservation.id),
				"payment_id": str(self.payment.id),
			},
			**object_overrides,
		}
		return {
			"id": event_id,
			"type": event_type,
			"api_version": "2025-01-01",
			"data": {"object": payment_intent},
		}

	def _build_deposit_event(self, event_id, event_type, **object_overrides):
		amount_minor = int((self.deposit.amount * Decimal("100")).quantize(Decimal("1")))
		payment_intent = {
			"id": self.deposit.stripe_payment_intent_id or "pi_deposit_test_123",
			"amount": amount_minor,
			"amount_capturable": amount_minor,
			"currency": self.deposit.currency.lower(),
			"metadata": {
				"reservation_id": str(self.reservation.id),
				"deposit_id": str(self.deposit.id),
				"purpose": "deposit",
			},
			**object_overrides,
		}
		return {
			"id": event_id,
			"type": event_type,
			"api_version": "2025-01-01",
			"data": {"object": payment_intent},
		}

	def test_payment_intent_succeeded_confirms_reservation_sets_vehicle_reserved_and_notifies_once(self):
		event = self._build_event("evt_success", "payment_intent.succeeded")

		with patch("payments.services.webhooks.create_invoice_for_reservation", return_value=type("InvoiceStub", (), {"id": 12345})()) as mocked_invoice, patch(
			"payments.services.webhooks.send_mail"
		) as mocked_send_mail:
			process_stripe_event(event)
			process_stripe_event(event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()

		self.assertEqual(self.payment.status, Payment.Status.REUSSI)
		self.assertIsNotNone(self.payment.succeeded_at)
		self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMEE)
		self.assertIsNotNone(self.reservation.confirmed_at)
		self.assertEqual(self.vehicle.status, Vehicle.Status.RESERVE)
		notifications = Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED")
		self.assertEqual(notifications.count(), 1)
		notification = notifications.first()
		self.assertEqual(notification.title, "Paiement reussi")
		self.assertIn(self.reservation.reference, notification.message)
		self.assertEqual(notification.related_object_type, "payment")
		self.assertEqual(notification.related_object_id, self.payment.id)
		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_success", processed=True).count(), 1)
		log = SystemLog.objects.filter(action="PAYMENT_SUCCESS", user=self.client_user).latest("created_at")
		self.assertEqual(log.level, SystemLog.Level.INFO)
		self.assertIn(f"id={self.payment.id}", log.message)
		self.assertIn(self.reservation.reference, log.message)
		self.assertIn(str(self.payment.amount), log.message)
		mocked_invoice.assert_called_once_with(self.reservation)
		mocked_send_mail.assert_called_once()
		kwargs = mocked_send_mail.call_args.kwargs
		self.assertEqual(kwargs["subject"], "Votre réservation GetACar est confirmée")
		self.assertEqual(kwargs["from_email"], getattr(settings, "DEFAULT_FROM_EMAIL", None))
		self.assertEqual(kwargs["recipient_list"], [self.client_user.email])
		message = kwargs["message"]
		self.assertIn("Bonjour", message)
		self.assertIn(self.reservation.reference, message)
		self.assertIn(self.vehicle.brand.name, message)
		self.assertIn(self.vehicle.model_name, message)
		self.assertIn("Début :", message)
		self.assertIn("Fin :", message)
		self.assertIn(str(self.reservation.rental_amount), message)
		self.assertIn(str(self.reservation.deposit_amount), message)
		self.assertIn("GetACar", message)

	def test_payment_intent_succeeded_keeps_event_retryable_when_invoice_integration_is_blocked(self):
		event = self._build_event("evt_invoice_blocked", "payment_intent.succeeded")

		with patch(
			"payments.services.webhooks.create_invoice_for_reservation",
			side_effect=InvoiceIntegrationPending("Invoice model is not available yet."),
		) as mocked_invoice, patch("payments.services.webhooks.send_mail") as mocked_send_mail:
			with self.assertRaises(InvoiceIntegrationPending):
				process_stripe_event(event)

		stripe_event = StripeEvent.objects.get(stripe_event_id="evt_invoice_blocked")
		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()

		self.assertFalse(stripe_event.processed)
		self.assertIn("Invoice model is not available yet", stripe_event.processing_error)
		self.assertEqual(self.payment.status, Payment.Status.EN_ATTENTE)
		self.assertEqual(self.reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
		self.assertEqual(self.vehicle.status, Vehicle.Status.DISPONIBLE)
		self.assertFalse(Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED").exists())
		self.assertFalse(SystemLog.objects.filter(action="PAYMENT_SUCCESS").exists())
		mocked_send_mail.assert_not_called()
		mocked_invoice.assert_called_once()

	@patch("payments.services.webhooks.create_invoice_for_reservation", return_value=object())
	def test_payment_intent_succeeded_marks_conflict_without_confirming_overlapping_reservations(self, mocked_invoice):
		Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=self.start_at + timedelta(hours=1),
			end_at=self.end_at - timedelta(hours=1),
			status=Reservation.Status.CONFIRMEE,
			rental_amount=Decimal("90.00"),
			deposit_amount=Decimal("200.00"),
			confirmed_at=timezone.now(),
		)

		event = self._build_event("evt_conflict", "payment_intent.succeeded")

		process_stripe_event(event)

		stripe_event = StripeEvent.objects.get(stripe_event_id="evt_conflict")

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()

		self.assertEqual(self.payment.status, Payment.Status.ECHOUE)
		self.assertEqual(self.payment.failure_code, "AVAILABILITY_CONFLICT")
		self.assertEqual(self.reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
		self.assertEqual(self.vehicle.status, Vehicle.Status.DISPONIBLE)
		self.assertTrue(stripe_event.processed)
		self.assertIsNone(stripe_event.processing_error)
		self.assertTrue(Notification.objects.filter(notification_type="PAYMENT_CONFLICT").exists())
		mocked_invoice.assert_not_called()

	def test_payment_intent_payment_failed_marks_payment_and_reservation_and_notifies_once(self):
		event = self._build_event(
			"evt_failed",
			"payment_intent.payment_failed",
			last_payment_error={"code": " card_declined ", "message": "  Carte refusee   "},
		)

		process_stripe_event(event)
		process_stripe_event(event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()

		self.assertEqual(self.payment.status, Payment.Status.ECHOUE)
		self.assertEqual(self.payment.failure_code, "card_declined")
		self.assertEqual(self.payment.failure_message, "Carte refusee")
		self.assertEqual(self.reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
		notifications = Notification.objects.filter(notification_type="PAYMENT_FAILED")
		self.assertEqual(notifications.count(), 1)
		notification = notifications.first()
		self.assertEqual(notification.title, "Paiement echoue")
		self.assertEqual(notification.message, "Votre paiement n'a pas abouti. Veuillez reessayer.")
		self.assertEqual(notification.related_object_type, "payment")
		self.assertEqual(notification.related_object_id, self.payment.id)
		self.assertNotIn("card_declined", notification.message)
		self.assertNotIn("Carte refusee", notification.message)
		log = SystemLog.objects.filter(action="PAYMENT_FAILED", user=self.client_user).latest("created_at")
		self.assertEqual(log.level, SystemLog.Level.ERROR)
		self.assertIn(f"id={self.payment.id}", log.message)
		self.assertIn(self.reservation.reference, log.message)
		for forbidden in [
			"card_number",
			"cvc",
			"client_secret",
			"sk_",
			"pm_",
			"PaymentMethod",
		]:
			self.assertNotIn(forbidden, log.action)
			self.assertNotIn(forbidden, log.message)

	def test_payment_intent_canceled_marks_payment_and_reservation_and_notifies_once(self):
		event = self._build_event(
			"evt_canceled",
			"payment_intent.canceled",
			cancellation_reason=" abandoned ",
		)

		process_stripe_event(event)
		process_stripe_event(event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()

		self.assertEqual(self.payment.status, Payment.Status.ANNULE)
		self.assertEqual(self.payment.failure_code, "abandoned")
		self.assertEqual(self.reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_CANCELED").count(), 1)

	@patch("payments.services.webhooks.create_invoice_for_reservation", return_value=object())
	def test_payment_intent_succeeded_is_idempotent_when_payment_already_succeeded(self, mocked_invoice):
		event = self._build_event("evt_success_again", "payment_intent.succeeded")

		process_stripe_event(event)

		replayed_event = self._build_event("evt_success_replayed", "payment_intent.succeeded")
		process_stripe_event(replayed_event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()

		self.assertEqual(self.payment.status, Payment.Status.REUSSI)
		self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMEE)
		self.assertEqual(self.vehicle.status, Vehicle.Status.RESERVE)
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED").count(), 1)
		self.assertEqual(StripeEvent.objects.filter(processed=True, event_type="payment_intent.succeeded").count(), 2)
		mocked_invoice.assert_called_once_with(self.reservation)

	def test_payment_intent_payment_failed_replayed_event_does_not_duplicate_notification(self):
		event = self._build_event(
			"evt_failed_replayed",
			"payment_intent.payment_failed",
			last_payment_error={"code": "card_declined", "message": "Carte refusee"},
		)

		process_stripe_event(event)
		process_stripe_event(event)

		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_FAILED").count(), 1)

	def test_deposit_authorization_webhook_marks_deposit_authorized_and_is_idempotent(self):
		self.reservation.status = Reservation.Status.BROUILLON
		self.reservation.save(update_fields=["status", "updated_at"])
		event = self._build_deposit_event("evt_deposit_authorized", "payment_intent.amount_capturable_updated")

		process_stripe_event(event)
		process_stripe_event(event)

		self.deposit.refresh_from_db()
		self.reservation.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.AUTORISEE)
		self.assertIsNotNone(self.deposit.authorized_at)
		self.assertIsNone(self.deposit.released_at)
		self.assertEqual(self.reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_deposit_authorized", processed=True).count(), 1)
		self.assertEqual(SystemLog.objects.filter(action="DEPOSIT_AUTHORIZED", user=self.client_user).count(), 1)

	def test_deposit_webhook_never_releases_authorized_caution(self):
		self.deposit.status = Deposit.Status.AUTORISEE
		self.deposit.authorized_at = timezone.now()
		self.deposit.stripe_payment_intent_id = "pi_deposit_test_123"
		self.deposit.save(update_fields=["status", "authorized_at", "stripe_payment_intent_id", "updated_at"])
		event = self._build_deposit_event("evt_deposit_succeeded", "payment_intent.succeeded")

		process_stripe_event(event)

		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.AUTORISEE)
		self.assertIsNone(self.deposit.released_at)
		self.assertIsNone(self.deposit.captured_at)


class DepositAuthorizationNotificationTests(TestCase):
	def setUp(self):
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="deposit-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1990, 1, 1),
			address="Rue Deposit 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		end_date = timezone.localdate() + timedelta(days=30)
		for document_type in (
			ClientDocument.DocumentType.CARTE_IDENTITE,
			ClientDocument.DocumentType.PERMIS_CONDUIRE,
		):
			ClientDocument.objects.create(
				client=self.profile,
				document_type=document_type,
				document_number=f"DEP-{document_type}",
				file="client_documents/test.pdf",
				expiration_date=end_date,
				status=ClientDocument.Status.VALIDE,
				is_active=True,
			)

		brand = Brand.objects.create(name="Deposit Brand", is_active=True)
		category = VehicleCategory.objects.create(
			name="Deposit Category",
			description="Category",
			daily_rate=Decimal("70.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("350.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		parking = Parking.objects.create(name="Deposit Parking", address="Rue P", capacity=10, is_active=True)
		space = ParkingSpace.objects.create(parking=parking, number="D1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=brand,
			category=category,
			parking_space=space,
			registration_number="DEP-TEST-001",
			model_name="Model",
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

		start_at = timezone.now() + timedelta(days=3)
		self.reservation = Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=start_at,
			end_at=start_at + timedelta(days=2),
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("350.00"),
		)
		self.payment = Payment.objects.create(
			reservation=self.reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("120.00"),
			currency="EUR",
			status=Payment.Status.EN_ATTENTE,
			stripe_payment_intent_id="pi_test_deposit_notifications",
		)

	def _build_event(self, event_id, event_type, **object_overrides):
		payment_intent = {
			"id": self.payment.stripe_payment_intent_id,
			"amount": 12000,
			"amount_received": 12000,
			"currency": "eur",
			"metadata": {
				"reservation_id": str(self.reservation.id),
				"payment_id": str(self.payment.id),
			},
			**object_overrides,
		}
		return {
			"id": event_id,
			"type": event_type,
			"api_version": "2025-01-01",
			"data": {"object": payment_intent},
		}

	def test_deposit_authorized_creates_client_notification(self):
		self.reservation.status = Reservation.Status.EN_ATTENTE_CAUTION
		self.reservation.save(update_fields=["status", "updated_at"])

		with self.captureOnCommitCallbacks(execute=True):
			result = authorize_deposit(
				reservation=self.reservation,
				requested_by=self.client_user,
				mode=Deposit.Mode.SIMULATED,
			)

		deposit = result["deposit"]
		notifications = Notification.objects.filter(
			user=self.client_user,
			notification_type="DEPOSIT_AUTHORIZED",
			related_object_type="deposit",
			related_object_id=deposit.id,
		)
		self.assertEqual(notifications.count(), 1)
		notification = notifications.first()
		self.assertEqual(notification.title, "Caution autorisee")
		self.assertIn("a ete autorisee", notification.message)

	def test_deposit_authorization_failure_creates_no_notification(self):
		self.reservation.status = Reservation.Status.ANNULEE
		self.reservation.cancelled_at = timezone.now()
		self.reservation.cancellation_reason = "Annulation test"
		self.reservation.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])

		with self.assertRaises(DepositAuthorizationError):
			authorize_deposit(
				reservation=self.reservation,
				requested_by=self.client_user,
				mode=Deposit.Mode.SIMULATED,
			)

		self.assertFalse(Notification.objects.filter(notification_type="DEPOSIT_AUTHORIZED").exists())

	def test_payment_intent_succeeded_rejects_amount_mismatch(self):
		event = self._build_event("evt_bad_amount", "payment_intent.succeeded", amount=9999, amount_received=9999)

		with self.assertRaisesMessage(Exception, "Stripe amount mismatch"):
			process_stripe_event(event)

		stripe_event = StripeEvent.objects.get(stripe_event_id="evt_bad_amount")
		self.assertFalse(stripe_event.processed)

	def test_payment_not_found_marks_event_retryable(self):
		event = {
			"id": "evt_unknown_payment",
			"type": "payment_intent.succeeded",
			"api_version": "2025-01-01",
			"data": {
				"object": {
					"id": "pi_missing_123",
					"amount": 12000,
					"amount_received": 12000,
					"currency": "eur",
				}
			},
		}

		process_stripe_event(event)

		stored_event = StripeEvent.objects.get(stripe_event_id="evt_unknown_payment")
		self.assertTrue(stored_event.processed)
		self.assertIsNone(stored_event.processing_error)

	def test_unknown_event_type_is_processed_without_side_effects(self):
		event = {
			"id": "evt_unknown_type",
			"type": "customer.created",
			"api_version": "2025-01-01",
			"data": {"object": {"id": "cus_123"}},
		}

		before_status = self.payment.status
		process_stripe_event(event)

		self.payment.refresh_from_db()
		self.assertEqual(self.payment.status, before_status)
		stored_event = StripeEvent.objects.get(stripe_event_id="evt_unknown_type")
		self.assertTrue(stored_event.processed)

	@patch("payments.services.webhooks.create_invoice_for_reservation", side_effect=InvoiceIntegrationPending("Invoice temporarily unavailable"))
	def test_local_error_then_retry_succeeds(self, mocked_invoice):
		event = self._build_event("evt_retry_flow", "payment_intent.succeeded")

		with self.assertRaises(InvoiceIntegrationPending):
			process_stripe_event(event)

		self.payment.refresh_from_db()
		self.assertEqual(self.payment.status, Payment.Status.EN_ATTENTE)

		mocked_invoice.side_effect = None
		mocked_invoice.return_value = object()
		process_stripe_event(event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()
		stored_event = StripeEvent.objects.get(stripe_event_id="evt_retry_flow")
		self.assertTrue(stored_event.processed)
		self.assertEqual(self.payment.status, Payment.Status.REUSSI)
		self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMEE)
		self.assertEqual(self.vehicle.status, Vehicle.Status.RESERVE)

	def test_success_processing_is_atomic_on_local_error(self):
		event = self._build_event("evt_atomic", "payment_intent.succeeded")

		with patch("payments.services.webhooks._notify_once", side_effect=RuntimeError("notif down")):
			with self.assertRaisesMessage(RuntimeError, "notif down"):
				with self.captureOnCommitCallbacks(execute=True):
					process_stripe_event(event)

		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.vehicle.refresh_from_db()
		stored_event = StripeEvent.objects.get(stripe_event_id="evt_atomic")
		self.assertEqual(self.payment.status, Payment.Status.REUSSI)
		self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMEE)
		self.assertEqual(self.vehicle.status, Vehicle.Status.RESERVE)
		self.assertTrue(stored_event.processed)
		self.assertIsNone(stored_event.processing_error)


class StripeWebhookEndpointTests(TestCase):
	def setUp(self):
		self.client_api = APIClient()
		self.url = reverse("payments:stripe-webhook")
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="endpoint-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1991, 1, 1),
			address="Rue Endpoint 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		end_date = timezone.localdate() + timedelta(days=45)
		for document_type in (
			ClientDocument.DocumentType.CARTE_IDENTITE,
			ClientDocument.DocumentType.PERMIS_CONDUIRE,
		):
			ClientDocument.objects.create(
				client=self.profile,
				document_type=document_type,
				document_number=f"END-{document_type}",
				file="client_documents/test.pdf",
				expiration_date=end_date,
				status=ClientDocument.Status.VALIDE,
				is_active=True,
			)
		brand = Brand.objects.create(name="Endpoint Brand", is_active=True)
		category = VehicleCategory.objects.create(
			name="Endpoint Category",
			description="Webhook endpoint tests",
			daily_rate=Decimal("100.00"),
			hourly_rate=Decimal("20.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		parking = Parking.objects.create(name="Endpoint Parking", address="Rue Endpoint", capacity=10, is_active=True)
		space = ParkingSpace.objects.create(parking=parking, number="E1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=brand,
			category=category,
			parking_space=space,
			registration_number="END-001",
			model_name="Model E",
			year=2024,
			color="Gray",
			energy_type="Hybrid",
			transmission="Auto",
			seats=5,
			doors=5,
			mileage=1200,
			status=Vehicle.Status.DISPONIBLE,
			is_active=True,
		)
		start_at = timezone.now() + timedelta(days=5)
		self.reservation = Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=start_at,
			end_at=start_at + timedelta(days=2),
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			rental_amount=Decimal("200.00"),
			deposit_amount=Decimal("300.00"),
		)
		self.payment = Payment.objects.create(
			reservation=self.reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("200.00"),
			currency="EUR",
			status=Payment.Status.EN_ATTENTE,
			stripe_payment_intent_id="pi_3U1BIPEFUqNLOdAL080PkwBz",
		)

	def test_invalid_signature_returns_400(self):
		with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
			with patch(
				"payments.views.stripe.Webhook.construct_event",
				side_effect=stripe.error.SignatureVerificationError("Bad signature", "sig_header"),
			):
				response = self.client_api.post(
					self.url,
					data='{"id":"evt_1","type":"payment_intent.succeeded"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=bad",
				)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["detail"], "Signature Stripe invalide.")

	def test_valid_signature_with_unknown_payment_intent_returns_200_without_side_effects(self):
		event = {
			"id": "evt_unknown_payment_intent",
			"type": "payment_intent.succeeded",
			"api_version": "2025-01-01",
			"data": {
				"object": {
					"id": "pi_missing_123",
					"amount": 12000,
					"amount_received": 12000,
					"currency": "eur",
					"metadata": {
						"reservation_id": "999999",
						"payment_id": "999999",
					},
				},
			},
		}

		with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
			with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
				response = self.client_api.post(
					self.url,
					data='{"id":"evt_unknown_payment_intent","type":"payment_intent.succeeded"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
				)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_unknown_payment_intent", processed=True).count(), 1)
		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.assertEqual(self.payment.status, Payment.Status.EN_ATTENTE)
		self.assertEqual(self.reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED").count(), 0)
		self.assertEqual(Notification.objects.filter(notification_type="RESERVATION_CONFIRMED").count(), 0)

	def test_charge_events_are_ignored_with_http_200(self):
		for event_type, event_id in (("charge.succeeded", "evt_charge_succeeded"), ("charge.updated", "evt_charge_updated")):
			event = {
				"id": event_id,
				"type": event_type,
				"api_version": "2025-01-01",
				"data": {"object": {"id": f"ch_{event_id}", "amount": 12000, "currency": "eur"}},
			}

			with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
				with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
					response = self.client_api.post(
						self.url,
						data=f'{{"id":"{event_id}","type":"{event_type}"}}',
						content_type="application/json",
						HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
					)

			self.assertEqual(response.status_code, status.HTTP_200_OK)
			self.assertEqual(StripeEvent.objects.filter(stripe_event_id=event_id, processed=True).count(), 1)

	def test_duplicate_event_returns_200_once_processed(self):
		event = {
			"id": "evt_duplicate",
			"type": "customer.created",
			"api_version": "2025-01-01",
			"data": {"object": {"id": "cus_1"}},
		}

		with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
			with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
				first = self.client_api.post(
					self.url,
					data='{"id":"evt_duplicate","type":"customer.created"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
				)
				second = self.client_api.post(
					self.url,
					data='{"id":"evt_duplicate","type":"customer.created"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
				)

		self.assertEqual(first.status_code, status.HTTP_200_OK)
		self.assertEqual(second.status_code, status.HTTP_200_OK)
		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_duplicate").count(), 1)

	def test_payment_intent_succeeded_realistic_payload_processes_successfully(self):
		event_payload = {
			"id": "evt_3U1BIPEFUqNLOdAL0DeXthM6",
			"type": "payment_intent.succeeded",
			"api_version": "2026-07-29.dahlia",
			"data": {
				"object": {
					"id": "pi_3U1BIPEFUqNLOdAL080PkwBz",
					"object": "payment_intent",
					"amount": 20000,
					"amount_received": 20000,
					"currency": "eur",
					"metadata": {
						"payment_id": str(self.payment.id),
						"reservation_id": str(self.reservation.id),
					},
				},
			},
		}

		with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
			with patch(
				"payments.views.stripe.Webhook.construct_event",
				return_value=stripe.Event.construct_from(event_payload, stripe.api_key),
			):
				response = self.client_api.post(
					self.url,
					data='{"id":"evt_3U1BIPEFUqNLOdAL0DeXthM6","type":"payment_intent.succeeded"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
				)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.payment.refresh_from_db()
		self.reservation.refresh_from_db()
		self.assertEqual(self.payment.status, Payment.Status.REUSSI)
		self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMEE)
		self.assertIsNotNone(self.reservation.confirmed_at)
		self.assertEqual(Invoice.objects.filter(reservation=self.reservation).count(), 1)
		self.assertEqual(
			Notification.objects.filter(
				user=self.client_user,
				notification_type="PAYMENT_SUCCEEDED",
				related_object_type="payment",
				related_object_id=self.payment.id,
			).count(),
			1,
		)

	def test_webhook_endpoint_rejects_payload_with_sensitive_fields(self):
		event = {
			"id": "evt_sensitive",
			"type": "customer.created",
			"api_version": "2025-01-01",
			"data": {
				"object": {
					"id": "cus_sensitive",
					"card_number": "4242424242424242",
					"cvc": "123",
					"expiry": "12/30",
					"pin": "9999",
					"secret_key": getattr(settings, "STRIPE_SECRET_KEY", ""),
				}
			},
		}

		with self.settings(STRIPE_WEBHOOK_SECRET="whsec_test"):
			with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
				response = self.client_api.post(
					self.url,
					data='{"id":"evt_sensitive","type":"customer.created"}',
					content_type="application/json",
					HTTP_STRIPE_SIGNATURE="t=1,v1=sig",
				)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		stored_event = StripeEvent.objects.get(stripe_event_id="evt_sensitive")
		payload_text = str(stored_event.payload)
		self.assertNotIn("4242424242424242", payload_text)
		self.assertNotIn("123", payload_text)
		self.assertNotIn("12/30", payload_text)
		self.assertNotIn("9999", payload_text)


class StripeWebhookInvoiceNotificationTests(TestCase):
	def setUp(self):
		self.roles = ensure_roles()
		self.client_user = create_user(
			email="invoice-client@example.com",
			password="StrongPass123!",
			role=self.roles[Role.Code.CLIENT],
			email_verified=True,
			is_active=True,
		)
		self.profile = ClientProfile.objects.create(
			user=self.client_user,
			date_of_birth=date(1990, 1, 1),
			address="Rue Invoice 1",
			profile_status=ClientProfile.ProfileStatus.VALIDE,
		)
		end_date = timezone.localdate() + timedelta(days=15)
		for document_type in (
			ClientDocument.DocumentType.CARTE_IDENTITE,
			ClientDocument.DocumentType.PERMIS_CONDUIRE,
		):
			ClientDocument.objects.create(
				client=self.profile,
				document_type=document_type,
				document_number=f"INV-{document_type}",
				file="client_documents/test.pdf",
				expiration_date=end_date + timedelta(days=30),
				status=ClientDocument.Status.VALIDE,
				is_active=True,
			)

		self.brand = Brand.objects.create(name="Invoice Brand", is_active=True)
		self.category = VehicleCategory.objects.create(
			name="Invoice Category",
			description="Category",
			daily_rate=Decimal("50.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		self.parking = Parking.objects.create(
			name="Invoice Parking",
			address="Rue Parking 1",
			capacity=10,
			is_active=True,
		)
		self.parking_space = ParkingSpace.objects.create(parking=self.parking, number="B1", is_active=True)
		self.vehicle = Vehicle.objects.create(
			brand=self.brand,
			category=self.category,
			parking_space=self.parking_space,
			registration_number="INV-001",
			model_name="Model",
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

		self.start_at = timezone.now() + timedelta(days=10)
		self.end_at = self.start_at + timedelta(days=3)
		self.reservation = Reservation.objects.create(
			client=self.profile,
			vehicle=self.vehicle,
			start_at=self.start_at,
			end_at=self.end_at,
			status=Reservation.Status.EN_ATTENTE_PAIEMENT,
			rental_amount=Decimal("120.00"),
			deposit_amount=Decimal("300.00"),
		)
		self.payment = Payment.objects.create(
			reservation=self.reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("120.00"),
			currency="EUR",
			status=Payment.Status.EN_ATTENTE,
			stripe_payment_intent_id="pi_test_invoice_notifications",
		)

	def _build_event(self, event_id, event_type):
		amount_minor = int((self.payment.amount * Decimal("100")).quantize(Decimal("1")))
		return {
			"id": event_id,
			"type": event_type,
			"api_version": "2025-01-01",
			"data": {
				"object": {
					"id": self.payment.stripe_payment_intent_id,
					"amount": amount_minor,
					"amount_received": amount_minor,
					"currency": self.payment.currency.lower(),
					"metadata": {
						"reservation_id": str(self.reservation.id),
						"payment_id": str(self.payment.id),
					},
				},
			},
		}

	@patch("payments.services.webhooks.create_invoice_for_reservation", return_value=object())
	def test_payment_intent_succeeded_creates_only_one_invoice_and_notification(self, mocked_invoice):
		mocked_invoice.return_value = type("InvoiceStub", (), {"id": 12345})()
		event = self._build_event("evt_invoice_once", "payment_intent.succeeded")

		process_stripe_event(event)
		process_stripe_event(event)

		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_invoice_once", processed=True).count(), 1)
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED").count(), 1)
		self.assertEqual(Notification.objects.filter(notification_type="RESERVATION_CONFIRMED").count(), 1)
		self.assertEqual(Notification.objects.filter(notification_type="INVOICE_AVAILABLE").count(), 1)
		mocked_invoice.assert_called_once_with(self.reservation)
