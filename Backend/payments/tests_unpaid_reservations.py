from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from payments.models import Deposit, Payment, Refund
from payments.services.webhooks import process_stripe_event
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin


class UnpaidReservationVisibilityTests(ReservationTestDataMixin, TestCase):
    def _results(self, response):
        data = response.data
        return data["results"] if isinstance(data, dict) and "results" in data else data

    def test_unpaid_reservations_are_hidden_from_client_and_manager_lists(self):
        base = timezone.now() + timedelta(days=10)
        hidden_statuses = [
            Reservation.Status.BROUILLON,
            Reservation.Status.EN_ATTENTE_CAUTION,
            Reservation.Status.EN_ATTENTE_PAIEMENT,
            Reservation.Status.PAIEMENT_ECHOUE,
        ]
        hidden_ids = []
        for index, hidden_status in enumerate(hidden_statuses):
            start = base + timedelta(days=index * 3)
            hidden_ids.append(
                self._create_reservation(status=hidden_status, start_at=start, end_at=start + timedelta(days=1)).id
            )
        abandoned = self._create_reservation(
            status=Reservation.Status.ANNULEE,
            start_at=base + timedelta(days=20),
            end_at=base + timedelta(days=21),
        )
        hidden_ids.append(abandoned.id)
        confirmed = self._create_reservation(
            status=Reservation.Status.CONFIRMEE,
            start_at=base + timedelta(days=30),
            end_at=base + timedelta(days=31),
        )
        Reservation.objects.filter(pk=confirmed.pk).update(confirmed_at=timezone.now())

        client_api = APIClient()
        client_api.force_authenticate(self.client_user_1)
        client_ids = {item["id"] for item in self._results(client_api.get(reverse("reservations:reservation-list-create")))}
        self.assertIn(confirmed.id, client_ids)
        self.assertFalse(client_ids.intersection(hidden_ids))

        manager_api = APIClient()
        manager_api.force_authenticate(self.manager_user)
        manager_ids = {item["id"] for item in self._results(manager_api.get(reverse("reservations:management-reservation-list")))}
        self.assertIn(confirmed.id, manager_ids)
        self.assertFalse(manager_ids.intersection(hidden_ids))


class AvailabilityConflictAfterPaymentTests(ReservationTestDataMixin, TestCase):
    def _event(self, *, reservation, payment, event_id):
        amount_minor = int((payment.amount * Decimal("100")).quantize(Decimal("1")))
        return {
            "id": event_id,
            "type": "payment_intent.succeeded",
            "api_version": "2025-01-01",
            "data": {
                "object": {
                    "id": payment.stripe_payment_intent_id,
                    "amount": amount_minor,
                    "amount_received": amount_minor,
                    "currency": "eur",
                    "metadata": {"reservation_id": str(reservation.id), "payment_id": str(payment.id)},
                }
            },
        }

    def _pending_payment(self, reservation, intent_id):
        return Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=Decimal("80.00"),
            currency="EUR",
            status=Payment.Status.EN_ATTENTE,
            stripe_payment_intent_id=intent_id,
        )

    def test_late_payment_on_taken_vehicle_is_refunded_and_not_confirmed(self):
        start = timezone.now() + timedelta(days=5)
        end = start + timedelta(days=2)
        winner = self._create_reservation(
            client=self.client_profile_2,
            status=Reservation.Status.CONFIRMEE,
            start_at=start,
            end_at=end,
        )
        loser = self._create_reservation(status=Reservation.Status.EN_ATTENTE_PAIEMENT, start_at=start, end_at=end)
        self.assertEqual(winner.vehicle_id, loser.vehicle_id)
        payment = self._pending_payment(loser, "pi_conflict_001")

        with patch("payments.services.webhooks.stripe.Refund.create") as mocked_refund, patch(
            "payments.services.webhooks.send_mail"
        ):
            mocked_refund.return_value = SimpleNamespace(id="re_conflict_001", status="succeeded")
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(self._event(reservation=loser, payment=payment, event_id="evt_conflict_001"))
            # Stripe re-delivering the same event must not refund twice or confirm.
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(self._event(reservation=loser, payment=payment, event_id="evt_conflict_001"))
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(self._event(reservation=loser, payment=payment, event_id="evt_conflict_002"))

        loser.refresh_from_db()
        self.assertEqual(loser.status, Reservation.Status.PAIEMENT_ECHOUE)
        self.assertIsNone(loser.confirmed_at)
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.status, Refund.Status.REUSSI)
        self.assertEqual(refund.amount, Decimal("80.00"))
        self.assertEqual(mocked_refund.call_count, 1)

    def test_repeated_success_webhook_confirms_once(self):
        start = timezone.now() + timedelta(days=8)
        reservation = self._create_reservation(
            status=Reservation.Status.EN_ATTENTE_PAIEMENT, start_at=start, end_at=start + timedelta(days=1)
        )
        payment = self._pending_payment(reservation, "pi_repeat_001")

        with patch(
            "invoicing.services.create_invoice_for_reservation",
            return_value=type("InvoiceStub", (), {"id": 777})(),
        ), patch("payments.services.webhooks.send_mail"):
            process_stripe_event(self._event(reservation=reservation, payment=payment, event_id="evt_repeat_001"))
            process_stripe_event(self._event(reservation=reservation, payment=payment, event_id="evt_repeat_001"))
            process_stripe_event(self._event(reservation=reservation, payment=payment, event_id="evt_repeat_002"))

        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMEE)
        self.assertEqual(Payment.objects.filter(reservation=reservation, status=Payment.Status.REUSSI).count(), 1)
        self.assertFalse(Refund.objects.filter(reservation=reservation).exists())
        self.assertFalse(Deposit.objects.filter(reservation=reservation, status=Deposit.Status.LIBEREE).exists())
