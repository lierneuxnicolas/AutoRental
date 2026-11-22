from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import stripe
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from payments.models import Deposit
from reservations.models import Reservation, ReservationAdditionalCharge
from reservations.tests import ReservationTestDataMixin


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
class ReservationDepositSettlementTests(ReservationTestDataMixin, TestCase):
	PI_ID = "pi_test_settlement_123"

	def setUp(self):
		super().setUp()
		self.api = APIClient()
		now = timezone.now()
		self.reservation = self._create_reservation(
			status=Reservation.Status.A_CONTROLER,
			start_at=now - timedelta(hours=24),
			end_at=now,
		)
		self.reservation.deposit_amount = Decimal("500.00")
		self.reservation.save(update_fields=["deposit_amount", "updated_at"])
		self.deposit = Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.STRIPE_TEST,
			amount=Decimal("500.00"),
			currency="EUR",
			status=Deposit.Status.AUTORISEE,
			stripe_payment_intent_id=self.PI_ID,
			authorized_at=now - timedelta(hours=25),
		)
		self.settle_url = reverse(
			"reservations:management-reservation-settle-deposit",
			kwargs={"pk": self.reservation.id},
		)

	def _create_charge(self, charge_type, amount):
		return ReservationAdditionalCharge.objects.create(
			reservation=self.reservation,
			charge_type=charge_type,
			amount=Decimal(amount),
			justification="Constat documente" if Decimal(amount) > 0 else "",
			status=ReservationAdditionalCharge.Status.PROVISOIRE,
		)

	def _stripe_intent(self, *, pi_status="requires_capture", amount_capturable=50000):
		return SimpleNamespace(id=self.PI_ID, status=pi_status, amount_capturable=amount_capturable)

	def test_zero_charges_cancels_authorization_and_releases_full_deposit(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.RETARD, "0.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.cancel",
			return_value=SimpleNamespace(id=self.PI_ID, status="canceled"),
		) as cancel_mock, patch(
			"payments.services.deposits.stripe.PaymentIntent.capture"
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["deposit_status"], Deposit.Status.LIBEREE)
		self.assertEqual(response.data["captured_amount"], "0.00")
		self.assertEqual(response.data["released_amount"], "500.00")
		cancel_mock.assert_called_once()
		capture_mock.assert_not_called()
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.LIBEREE)
		self.assertIsNotNone(self.deposit.released_at)

	def test_partial_charges_capture_only_retained_amount(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		) as capture_mock, patch(
			"payments.services.deposits.stripe.PaymentIntent.cancel"
		) as cancel_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["deposit_status"], Deposit.Status.CAPTUREE)
		self.assertEqual(response.data["captured_amount"], "50.00")
		self.assertEqual(response.data["released_amount"], "450.00")
		cancel_mock.assert_not_called()
		capture_args = capture_mock.call_args
		self.assertEqual(capture_args.args[0], self.PI_ID)
		self.assertEqual(capture_args.kwargs["amount_to_capture"], 5000)
		self.assertIn("idempotency_key", capture_args.kwargs)
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.CAPTUREE)
		self.assertIsNotNone(self.deposit.captured_at)
		self.assertEqual(
			ReservationAdditionalCharge.objects.filter(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.VALIDEE,
			).count(),
			1,
		)

	def test_full_deposit_charges_capture_entire_authorization(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "500.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["captured_amount"], "500.00")
		self.assertEqual(response.data["released_amount"], "0.00")
		self.assertEqual(capture_mock.call_args.kwargs["amount_to_capture"], 50000)

	def test_charges_above_deposit_never_capture_more_than_authorized(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "650.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(amount_capturable=50000),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["captured_amount"], "500.00")
		self.assertEqual(response.data["released_amount"], "0.00")
		self.assertEqual(response.data["over_deposit_amount"], "150.00")
		self.assertEqual(capture_mock.call_args.kwargs["amount_to_capture"], 50000)

	def test_expired_authorization_is_marked_and_rejected_without_stripe_call(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.deposit.authorization_expires_at = timezone.now() - timedelta(hours=1)
		self.deposit.save(update_fields=["authorization_expires_at", "updated_at"])
		self.api.force_authenticate(self.manager_user)

		with patch("payments.services.deposits.stripe.PaymentIntent.retrieve") as retrieve_mock, patch(
			"payments.services.deposits.stripe.PaymentIntent.capture"
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "DEPOSIT_AUTHORIZATION_EXPIRED")
		retrieve_mock.assert_not_called()
		capture_mock.assert_not_called()
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.EXPIREE)
		# La reservation n'est pas cloturee et les frais restent provisoires.
		self.reservation.refresh_from_db()
		self.assertEqual(self.reservation.status, Reservation.Status.A_CONTROLER)
		self.assertTrue(
			ReservationAdditionalCharge.objects.filter(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
			).exists()
		)

	def test_repeated_call_is_rejected_and_captures_only_once(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		) as capture_mock:
			first = self.api.post(self.settle_url)
			second = self.api.post(self.settle_url)

		self.assertEqual(first.status_code, status.HTTP_200_OK)
		self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(second.data["code"], "DEPOSIT_ALREADY_SETTLED")
		self.assertEqual(capture_mock.call_count, 1)

	def test_stripe_error_keeps_local_state_untouched(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			side_effect=stripe.error.APIConnectionError("connexion impossible"),
		):
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
		self.assertEqual(response.data["code"], "STRIPE_UNAVAILABLE")
		# Rule 10 : rien n'est annonce libere, rien n'est cloture, rien n'est valide.
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.AUTORISEE)
		self.assertIsNone(self.deposit.captured_at)
		self.assertIsNone(self.deposit.released_at)
		self.reservation.refresh_from_db()
		self.assertEqual(self.reservation.status, Reservation.Status.A_CONTROLER)
		self.assertEqual(
			ReservationAdditionalCharge.objects.filter(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
			).count(),
			1,
		)

	def test_capture_is_capped_by_stripe_amount_capturable(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "500.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(amount_capturable=30000),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(capture_mock.call_args.kwargs["amount_to_capture"], 30000)
		self.assertEqual(response.data["captured_amount"], "300.00")

	def test_cancelled_payment_intent_blocks_capture(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(pi_status="canceled"),
		), patch("payments.services.deposits.stripe.PaymentIntent.capture") as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "DEPOSIT_AUTHORIZATION_EXPIRED")
		capture_mock.assert_not_called()
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.AUTORISEE)

	def test_manager_role_is_required(self):
		self.api.force_authenticate(self.client_user_1)

		response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_reservation_must_be_a_controler(self):
		self.reservation.status = Reservation.Status.TERMINEE
		self.reservation.save(update_fields=["status", "updated_at"])
		self.api.force_authenticate(self.manager_user)

		response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "INVALID_STATUS")

	def test_simulated_deposit_is_settled_without_stripe_calls(self):
		self.deposit.mode = Deposit.Mode.SIMULATED
		self.deposit.stripe_payment_intent_id = None
		self.deposit.save(update_fields=["mode", "stripe_payment_intent_id", "updated_at"])
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "50.00")
		self.api.force_authenticate(self.manager_user)

		with patch("payments.services.deposits.stripe.PaymentIntent.retrieve") as retrieve_mock, patch(
			"payments.services.deposits.stripe.PaymentIntent.capture"
		) as capture_mock:
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		retrieve_mock.assert_not_called()
		capture_mock.assert_not_called()
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.status, Deposit.Status.CAPTUREE)

	def test_settlement_automatically_creates_complementary_invoice_with_pdf(self):
		from invoicing.models import Invoice

		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "110.50")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.capture",
			return_value=SimpleNamespace(id=self.PI_ID, status="succeeded"),
		):
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		invoice = Invoice.objects.get(reservation=self.reservation, invoice_type=Invoice.InvoiceType.COMPLEMENTAIRE)
		self.assertEqual(invoice.total_amount, Decimal("110.50"))
		self.assertTrue(invoice.pdf_file)
		self.deposit.refresh_from_db()
		self.assertEqual(self.deposit.captured_amount, Decimal("110.50"))

	def test_zero_charge_settlement_creates_no_complementary_invoice(self):
		from invoicing.models import Invoice

		self._create_charge(ReservationAdditionalCharge.ChargeType.RETARD, "0.00")
		self.api.force_authenticate(self.manager_user)

		with patch(
			"payments.services.deposits.stripe.PaymentIntent.retrieve",
			return_value=self._stripe_intent(),
		), patch(
			"payments.services.deposits.stripe.PaymentIntent.cancel",
			return_value=SimpleNamespace(id=self.PI_ID, status="canceled"),
		):
			response = self.api.post(self.settle_url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertFalse(
			Invoice.objects.filter(reservation=self.reservation, invoice_type=Invoice.InvoiceType.COMPLEMENTAIRE).exists()
		)
