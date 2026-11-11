from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from payments.models import Payment, Refund
from payments.services.webhooks import process_stripe_event
from invoicing.models import Invoice
from reservations.models import Reservation
from reservations.services.cancellation import calculate_cancellation_financials
from reservations.tests import ReservationTestDataMixin


class CancellationPolicyTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(self.client_user_1)

    def make_paid(self, hours, amount="120.00"):
        now = timezone.now()
        reservation = self._create_reservation(
            status=Reservation.Status.CONFIRMEE,
            start_at=now + timedelta(hours=hours),
            end_at=now + timedelta(hours=hours + 2),
        )
        Payment.objects.create(
            reservation=reservation, amount=Decimal(amount), currency="EUR",
            status=Payment.Status.REUSSI, stripe_payment_intent_id=f"pi_policy_{reservation.id}",
        )
        return reservation

    def test_financial_boundaries_and_small_payment(self):
        now = timezone.now()
        for hours, amount, fee, refund in [
            (25, "120.00", "20.00", "100.00"),
            (25, "10.00", "10.00", "0.00"),
            (24, "120.00", "0.00", "0.00"),
            (23, "120.00", "0.00", "0.00"),
        ]:
            with self.subTest(hours=hours, amount=amount):
                reservation = self.make_paid(hours, amount)
                reservation.start_at = now + timedelta(hours=hours)
                result = calculate_cancellation_financials(reservation=reservation, now=now)
                self.assertEqual(result.cancellation_fee, Decimal(fee))
                self.assertEqual(result.refundable_amount, Decimal(refund))

    @patch("reservations.services.cancellation.stripe.Refund.create")
    def test_early_cancellation_refunds_once(self, create_refund):
        reservation = self.make_paid(30)
        create_refund.return_value = SimpleNamespace(id="re_policy", status="succeeded")
        url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
        with self.settings(STRIPE_SECRET_KEY="sk_test_fake"):
            response = self.api.post(url, {"reason": "Annulation"}, format="json")
            repeat = self.api.post(url, {"reason": "Annulation"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(repeat.data["code"], "ALREADY_CANCELLED")
        self.assertEqual(Refund.objects.get(reservation=reservation).amount, Decimal("100.00"))
        self.assertEqual(create_refund.call_args.kwargs["amount"], 10000)
        self.assertEqual(create_refund.call_count, 1)

    @patch("reservations.services.cancellation.stripe.Refund.create")
    def test_late_cancellation_requires_confirmation_and_never_refunds(self, create_refund):
        reservation = self.make_paid(5)
        url = reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id})
        preview = self.api.get(reverse("reservations:reservation-cancel-preview", kwargs={"pk": reservation.id}))
        self.assertTrue(preview.data["no_refund"])
        response = self.api.post(url, {"reason": "Annulation"}, format="json")
        self.assertEqual(response.data["code"], "NO_REFUND_CONFIRMATION_REQUIRED")
        response = self.api.post(url, {"reason": "Annulation", "confirm_no_refund": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cancellation_financials"]["cancellation_fee"], Decimal("0.00"))
        self.assertEqual(response.data["cancellation_financials"]["refundable_amount"], Decimal("0.00"))
        create_refund.assert_not_called()
        invoice = Invoice.objects.get(reservation=reservation)
        self.assertEqual(invoice.total_amount, Decimal("120.00"))
        pdf = self.api.get(reverse("invoicing:invoice-download", kwargs={"pk": invoice.id}))
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(b"".join(pdf.streaming_content).startswith(b"%PDF"))

    def test_started_reservation_cannot_be_cancelled(self):
        reservation = self.make_paid(-1)
        response = self.api.post(
            reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id}),
            {"reason": "Annulation", "confirm_no_refund": True}, format="json",
        )
        self.assertEqual(response.data["code"], "CANNOT_CANCEL")

    @patch("reservations.services.cancellation.stripe.Refund.create")
    def test_pending_refund_issues_invoice_only_after_confirmed_webhook(self, create_refund):
        reservation = self.make_paid(30)
        create_refund.return_value = SimpleNamespace(id="re_pending_policy", status="pending")
        with self.settings(STRIPE_SECRET_KEY="sk_test_fake"):
            response = self.api.post(
                reverse("reservations:reservation-cancel", kwargs={"pk": reservation.id}),
                {"reason": "Annulation"}, format="json",
            )
            self.assertEqual(response.status_code, 200)
            self.assertFalse(Invoice.objects.filter(reservation=reservation).exists())
            payment = Payment.objects.get(reservation=reservation)
            stripe_refund = {
                "id": "re_pending_policy", "payment_intent": payment.stripe_payment_intent_id,
                "amount": 10000, "currency": "eur", "status": "succeeded",
            }
            event = {"id": "evt_policy_refund", "type": "refund.updated", "data": {"object": {"id": "re_pending_policy"}}}
            with patch("payments.services.webhooks.stripe.Refund.retrieve", return_value=stripe_refund):
                process_stripe_event(event)
                process_stripe_event(event)
        invoice = Invoice.objects.get(reservation=reservation)
        self.assertEqual(invoice.total_amount, Decimal("20.00"))
        self.assertEqual(Invoice.objects.filter(reservation=reservation).count(), 1)
        pdf = self.api.get(reverse("invoicing:invoice-download", kwargs={"pk": invoice.id}))
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(b"".join(pdf.streaming_content).startswith(b"%PDF"))
