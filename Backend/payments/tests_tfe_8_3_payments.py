from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from notifications.models import Notification
from payments.models import Deposit, Payment, Refund
from payments.services.webhooks import process_stripe_event
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin


class Tfe83PaymentsAndCancellationTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.client_user_1)

    def _deposit_url(self, reservation_id):
        return reverse("reservations:reservation-deposit-authorize", kwargs={"pk": reservation_id})

    def _payment_intent_url(self, reservation_id):
        return reverse("reservations:reservation-payment-intent", kwargs={"pk": reservation_id})

    def _cancel_url(self, reservation_id):
        return reverse("reservations:reservation-cancel", kwargs={"pk": reservation_id})

    def _create_authorized_deposit(self, reservation, *, status=Deposit.Status.AUTORISEE):
        return Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=status,
            authorized_at=timezone.now(),
        )

    def _create_success_payment(self, reservation, amount="120.00"):
        return Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=Decimal(amount),
            currency="EUR",
            status=Payment.Status.REUSSI,
            stripe_payment_intent_id=f"pi_tfe83_{reservation.id}_{int(timezone.now().timestamp() * 1000000)}",
        )

    def _build_payment_event(self, *, reservation, payment, event_id, event_type, **object_overrides):
        amount_minor = int((payment.amount * Decimal("100")).quantize(Decimal("1")))
        payment_intent = {
            "id": payment.stripe_payment_intent_id,
            "amount": amount_minor,
            "amount_received": amount_minor,
            "currency": payment.currency.lower(),
            "metadata": {
                "reservation_id": str(reservation.id),
                "payment_id": str(payment.id),
            },
            **object_overrides,
        }
        return {
            "id": event_id,
            "type": event_type,
            "api_version": "2025-01-01",
            "data": {"object": payment_intent},
        }

    def test_08_simulated_deposit_authorization_succeeds_and_is_recorded(self):
        reservation = self._create_reservation(status=Reservation.Status.BROUILLON)

        response = self.client_api.post(self._deposit_url(reservation.id), {"mode": "SIMULATED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        deposit = Deposit.objects.get(reservation=reservation)
        self.assertEqual(deposit.status, Deposit.Status.AUTORISEE)
        self.assertEqual(reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
        self.assertTrue(Notification.objects.filter(notification_type="DEPOSIT_AUTHORIZED", related_object_id=reservation.id).exists())

    def test_09_non_authorized_deposit_blocks_payment_confirmation(self):
        reservation = self._create_reservation(status=Reservation.Status.BROUILLON)
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.EN_ATTENTE,
        )

        with self.settings(STRIPE_SECRET_KEY="sk_test_123"):
            response = self.client_api.post(self._payment_intent_url(reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "DEPOSIT_NOT_AUTHORIZED")
        reservation.refresh_from_db()
        self.assertNotEqual(reservation.status, Reservation.Status.CONFIRMEE)
        self.assertFalse(Payment.objects.filter(reservation=reservation, status=Payment.Status.REUSSI).exists())

    def test_10_successful_stripe_payment_confirms_reservation(self):
        reservation = self._create_reservation(status=Reservation.Status.EN_ATTENTE_PAIEMENT)
        payment = Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=Decimal("80.00"),
            currency="EUR",
            status=Payment.Status.EN_ATTENTE,
            stripe_payment_intent_id="pi_tfe83_success_001",
        )
        event = self._build_payment_event(
            reservation=reservation,
            payment=payment,
            event_id="evt_tfe83_success_001",
            event_type="payment_intent.succeeded",
        )

        with patch("payments.services.webhooks.create_invoice_for_reservation", return_value=type("InvoiceStub", (), {"id": 12345})()), patch(
            "payments.services.webhooks.send_mail"
        ):
            process_stripe_event(event)

        payment.refresh_from_db()
        reservation.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REUSSI)
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMEE)
        self.assertIsNotNone(reservation.confirmed_at)

    def test_11_failed_stripe_payment_keeps_coherent_status(self):
        reservation = self._create_reservation(status=Reservation.Status.EN_ATTENTE_PAIEMENT)
        payment = Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=Decimal("80.00"),
            currency="EUR",
            status=Payment.Status.EN_ATTENTE,
            stripe_payment_intent_id="pi_tfe83_failed_001",
        )
        event = self._build_payment_event(
            reservation=reservation,
            payment=payment,
            event_id="evt_tfe83_failed_001",
            event_type="payment_intent.payment_failed",
            last_payment_error={"code": "card_declined", "message": "Carte refusee"},
        )

        process_stripe_event(event)

        payment.refresh_from_db()
        reservation.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.ECHOUE)
        self.assertEqual(reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
        self.assertFalse(Payment.objects.filter(reservation=reservation, status=Payment.Status.REUSSI).exists())

    def test_12_cancellation_of_confirmed_reservation_creates_refund_and_releases_deposit(self):
        start = timezone.now() + timedelta(hours=30)
        reservation = self._create_reservation(
            status=Reservation.Status.CONFIRMEE,
            start_at=start,
            end_at=start + timedelta(hours=2),
        )
        self._create_success_payment(reservation, amount="120.00")
        deposit = self._create_authorized_deposit(reservation)

        with patch("reservations.services.cancellation.stripe.Refund.create") as mocked_refund_create:
            mocked_refund_create.return_value = SimpleNamespace(id="re_tfe83_cancel_001", status="succeeded")
            with self.settings(STRIPE_SECRET_KEY="sk_test_cancel_123"):
                response = self.client_api.post(self._cancel_url(reservation.id), {"reason": "Annulation anticipee"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        deposit.refresh_from_db()
        refund = Refund.objects.get(reservation=reservation)
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertEqual(deposit.status, Deposit.Status.LIBEREE)
        self.assertEqual(refund.status, Refund.Status.REUSSI)
        self.assertIsNotNone(deposit.released_at)
