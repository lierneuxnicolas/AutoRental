from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile
from interventions.models import Intervention
from payments.models import Payment, Refund
from payments.services.payment_intents import PaymentIntentError, _assert_vehicle_still_available
from payments.services.webhooks import process_stripe_event
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin


class PaymentChecksTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(self.client_user_1)
        self.start, self.end = self._daily_period()
        self.payload = {
            "vehicle_id": self.vehicle_available.id,
            "start_at": self.start.isoformat(),
            "end_at": self.end.isoformat(),
        }

    def check(self, **overrides):
        return self.api.post(reverse("reservations:reservation-payment-checks"), {**self.payload, **overrides}, format="json")

    def document(self, kind):
        return ClientDocument.objects.get(client=self.client_profile_1, document_type=kind, is_active=True)

    def test_all_checks_pass_without_claiming_identity_was_compared(self):
        response = self.check()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.data), ["account", "identity", "license", "compatibility", "availability"])
        self.assertTrue(all(result["valid"] for result in response.data.values()))
        self.assertEqual(response.data["identity"]["message"], "Identité validée — 21 ans minimum vérifiés")

    def test_unverified_email_fails_account(self):
        self.client_user_1.email_verified = False
        self.client_user_1.save(update_fields=["email_verified"])
        self.assertFalse(self.check().data["account"]["valid"])

    def test_verified_underage_identity_has_clear_payment_check(self):
        birth_date = self.start.date().replace(year=self.start.year - 20)
        self.client_profile_1.date_of_birth = birth_date
        self.client_profile_1.save(update_fields=["date_of_birth"])
        card = self.document(ClientDocument.DocumentType.CARTE_IDENTITE)
        card.verified_date_of_birth = birth_date
        card.save(update_fields=["verified_date_of_birth"])
        response = self.check()
        self.assertEqual(len(response.data), 5)
        self.assertFalse(response.data["identity"]["valid"])
        self.assertEqual(response.data["identity"]["message"], "Vous devez avoir au moins 21 ans au début de la location.")

    def test_legacy_identity_needs_verification_in_payment_check(self):
        card = self.document(ClientDocument.DocumentType.CARTE_IDENTITE)
        card.verified_date_of_birth = None
        card.save(update_fields=["verified_date_of_birth"])
        response = self.check()
        self.assertFalse(response.data["identity"]["valid"])
        self.assertEqual(response.data["identity"]["message"], "Date de naissance officielle non vérifiée.")
        self.assertEqual(response.data["identity"]["state"], "pending")

    def test_twenty_today_and_twenty_one_on_departure_passes_identity(self):
        start_date = timezone.localtime(self.start).date()
        birth_date = ClientProfile._subtract_years(start_date, 21)
        self.assertGreater(birth_date, ClientProfile._subtract_years(timezone.localdate(), 21))
        self.client_profile_1.date_of_birth = birth_date
        self.client_profile_1.save(update_fields=["date_of_birth"])
        card = self.document(ClientDocument.DocumentType.CARTE_IDENTITE)
        card.verified_date_of_birth = birth_date
        card.save(update_fields=["verified_date_of_birth"])
        response = self.check()
        self.assertTrue(response.data["identity"]["valid"])
        self.assertEqual(response.data["identity"]["message"], "Identité validée — 21 ans minimum vérifiés")

    def test_inactive_account_fails(self):
        self.client_user_1.is_active = False
        self.client_user_1.save(update_fields=["is_active"])
        self.assertEqual(self.check().status_code, 403)

    def test_unvalidated_identity_fails(self):
        card = self.document(ClientDocument.DocumentType.CARTE_IDENTITE)
        card.status = ClientDocument.Status.EN_ATTENTE
        card.save(update_fields=["status"])
        self.assertFalse(self.check().data["identity"]["valid"])

    def test_expired_identity_and_underage(self):
        card = self.document(ClientDocument.DocumentType.CARTE_IDENTITE)
        card.expiration_date = timezone.localdate() - timedelta(days=1)
        card.save(update_fields=["expiration_date"])
        check = self.check().data["identity"]
        self.assertFalse(check["valid"])
        self.assertIn("expirée", check["message"])

    def test_expired_license_and_incompatible_transmission(self):
        license_doc = self.document(ClientDocument.DocumentType.PERMIS_CONDUIRE)
        license_doc.expiration_date = timezone.localdate() - timedelta(days=1)
        license_doc.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        license_doc.save(update_fields=["expiration_date", "driving_license_transmission"])
        self.vehicle_available.transmission = "Manual"
        self.vehicle_available.save(update_fields=["transmission"])
        response = self.check()
        self.assertFalse(response.data["license"]["valid"])
        self.assertFalse(response.data["compatibility"]["valid"])

    def test_own_draft_is_excluded_but_other_clients_draft_is_not(self):
        own = self._create_reservation(start_at=self.start, end_at=self.end)
        self.assertFalse(self.check().data["availability"]["valid"])
        self.assertTrue(self.check(reservation_id=own.pk).data["availability"]["valid"])
        other = self._create_reservation(client=self.client_profile_2, start_at=self.start, end_at=self.end)
        self.assertFalse(self.check(reservation_id=own.pk).data["availability"]["valid"])
        self.assertEqual(self.check(reservation_id=other.pk).status_code, 404)

    def test_planned_intervention_blocks_availability(self):
        Intervention.objects.create(
            reference="INT-CHECK-1",
            vehicle=self.vehicle_available,
            created_by=self.manager_user,
            intervention_type=Intervention.Type.MECANIQUE,
            planned_start_at=self.start,
            planned_end_at=self.end,
        )
        self.assertFalse(self.check().data["availability"]["valid"])
        reservation = self._create_reservation(start_at=self.start, end_at=self.end)
        with self.assertRaises(PaymentIntentError) as error:
            _assert_vehicle_still_available(reservation)
        self.assertEqual(error.exception.code, "RESERVATION_UNAVAILABLE")

    def test_mismatched_period_does_not_exclude_own_reservation(self):
        own = self._create_reservation(start_at=self.start, end_at=self.end)
        response = self.check(reservation_id=own.pk, end_at=(self.end + timedelta(days=1)).isoformat())
        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_request_is_rejected(self):
        self.api.force_authenticate(user=None)
        self.assertEqual(self.check().status_code, 401)


class PaymentChecksWebhookTests(ReservationTestDataMixin, TestCase):
    def test_unverified_age_late_payment_refunded_once(self):
        start, end = self._daily_period()
        reservation = self._create_reservation(status=Reservation.Status.EN_ATTENTE_PAIEMENT, start_at=start, end_at=end)
        payment = Payment.objects.create(
            reservation=reservation, provider=Payment.Provider.STRIPE,
            amount="120.00", currency="EUR", status=Payment.Status.EN_ATTENTE,
            stripe_payment_intent_id="pi_age_late",
        )
        ClientDocument.objects.filter(
            client=self.client_profile_1, document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
        ).update(verified_date_of_birth=None)
        event = {
            "id": "evt_age_late", "type": "payment_intent.succeeded",
            "data": {"object": {"id": payment.stripe_payment_intent_id, "amount": 12000,
                                "amount_received": 12000, "currency": "eur",
                                "metadata": {"reservation_id": str(reservation.id), "payment_id": str(payment.id)}}},
        }
        with patch("payments.services.webhooks.stripe.Refund.create", return_value=SimpleNamespace(id="re_age", status="succeeded")) as refund:
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(event)
            event["id"] = "evt_age_repeat"
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(event)
        reservation.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(payment.failure_code, "ELIGIBILITY_CONFLICT")
        self.assertEqual(reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
        self.assertEqual(Refund.objects.filter(payment=payment).count(), 1)
        refund.assert_called_once()

    def test_incompatible_late_payment_refunded_once_and_never_confirmed(self):
        start, end = self._daily_period()
        reservation = self._create_reservation(status=Reservation.Status.EN_ATTENTE_PAIEMENT, start_at=start, end_at=end)
        payment = Payment.objects.create(
            reservation=reservation, provider=Payment.Provider.STRIPE,
            amount="120.00", currency="EUR", status=Payment.Status.EN_ATTENTE,
            stripe_payment_intent_id="pi_checks_late",
        )
        self.vehicle_available.transmission = "Manual"
        self.vehicle_available.save(update_fields=["transmission"])
        document = ClientDocument.objects.get(client=self.client_profile_1, document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE)
        document.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        document.save(update_fields=["driving_license_transmission"])
        event = {
            "id": "evt_checks_late", "type": "payment_intent.succeeded",
            "data": {"object": {"id": payment.stripe_payment_intent_id, "amount": 12000,
                                "amount_received": 12000, "currency": "eur",
                                "metadata": {"reservation_id": str(reservation.id), "payment_id": str(payment.id)}}},
        }
        with patch("payments.services.webhooks.stripe.Refund.create", return_value=SimpleNamespace(id="re_checks", status="succeeded")) as refund:
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(event)
            event["id"] = "evt_checks_repeat"
            with self.captureOnCommitCallbacks(execute=True):
                process_stripe_event(event)
        payment.refresh_from_db()
        reservation.refresh_from_db()
        self.assertEqual(payment.failure_code, "ELIGIBILITY_CONFLICT")
        self.assertEqual(reservation.status, Reservation.Status.PAIEMENT_ECHOUE)
        self.assertEqual(Refund.objects.filter(payment=payment).count(), 1)
        refund.assert_called_once()
