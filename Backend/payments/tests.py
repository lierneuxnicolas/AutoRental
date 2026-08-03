from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile, Role
from accounts.tests.utils import create_user, ensure_roles
from notifications.models import Notification
from payments.models import Payment, StripeEvent
from payments.services.webhooks import InvoiceIntegrationPending, process_stripe_event
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


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

	@patch("payments.services.webhooks.create_invoice_for_reservation", return_value=object())
	def test_payment_intent_succeeded_confirms_reservation_sets_vehicle_reserved_and_notifies_once(self, mocked_invoice):
		event = self._build_event("evt_success", "payment_intent.succeeded")

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
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_SUCCEEDED").count(), 1)
		self.assertEqual(StripeEvent.objects.filter(stripe_event_id="evt_success", processed=True).count(), 1)
		mocked_invoice.assert_called_once_with(self.reservation)

	@patch("payments.services.webhooks.create_invoice_for_reservation", side_effect=InvoiceIntegrationPending("Invoice model is not available yet."))
	def test_payment_intent_succeeded_keeps_event_retryable_when_invoice_integration_is_blocked(self, mocked_invoice):
		event = self._build_event("evt_invoice_blocked", "payment_intent.succeeded")

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
		self.assertEqual(Notification.objects.filter(notification_type="PAYMENT_FAILED").count(), 1)

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

	def test_payment_intent_succeeded_rejects_amount_mismatch(self):
		event = self._build_event("evt_bad_amount", "payment_intent.succeeded", amount=9999, amount_received=9999)

		with self.assertRaisesMessage(Exception, "Stripe amount mismatch"):
			process_stripe_event(event)

		stripe_event = StripeEvent.objects.get(stripe_event_id="evt_bad_amount")
		self.assertFalse(stripe_event.processed)
