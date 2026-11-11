from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile, DocumentVerificationChange
from accounts.services.profile_validation import validate_client_for_reservation
from accounts.services.profile_status import recalculate_profile_status
from payments.services.deposits import DepositAuthorizationError, _validate_request_context
from payments.services.payment_intents import PaymentIntentError, _assert_profile_still_valid, create_or_reuse_payment_intent
from reservations.models import Reservation
from reservations.services.reservation_creation import ReservationCreationError, _validate_client_eligibility
from reservations.tests import ReservationTestDataMixin


class VerifiedAgeTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.start, self.end = self._daily_period()
        self.card = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            is_active=True,
        )
        self.card.verified_date_of_birth = self.client_profile_1.date_of_birth
        self.card.save(update_fields=["verified_date_of_birth"])

    def eligibility(self):
        return validate_client_for_reservation(
            self.client_profile_1, timezone.localtime(self.start).date(), timezone.localtime(self.end).date()
        )

    def set_birth_date(self, birth_date):
        ClientProfile.objects.filter(pk=self.client_profile_1.pk).update(date_of_birth=birth_date)
        self.client_profile_1.refresh_from_db()
        self.card.verified_date_of_birth = birth_date
        self.card.save(update_fields=["verified_date_of_birth"])

    def test_age_20_is_refused_and_age_21_is_allowed(self):
        start_date = timezone.localtime(self.start).date()
        self.set_birth_date(ClientProfile._subtract_years(start_date, 21) + timedelta(days=1))
        self.assertIn("UNDER_MINIMUM_AGE", self.eligibility().errors)
        self.set_birth_date(ClientProfile._subtract_years(start_date, 21))
        self.assertTrue(self.eligibility().is_eligible)

    def test_manager_can_validate_underage_identity_but_cannot_enable_reservation_or_payment(self):
        self.card.status = ClientDocument.Status.EN_ATTENTE
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["status", "verified_date_of_birth"])
        birth_date = ClientProfile._subtract_years(timezone.localdate(), 20)
        self.api.force_authenticate(self.manager_user)
        url = reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk})
        response = self.api.post(url, {**self.verification_payload(), "verified_date_of_birth": birth_date.isoformat()}, format="json")
        self.assertEqual(response.status_code, 200)
        self.card.refresh_from_db()
        self.client_profile_1.refresh_from_db()
        self.assertEqual(self.card.status, ClientDocument.Status.VALIDE)
        self.assertEqual(self.card.verified_date_of_birth, birth_date)
        self.assertIn("UNDER_MINIMUM_AGE", self.eligibility().errors)
        with self.assertRaises(ReservationCreationError) as reservation_error:
            _validate_client_eligibility(client=self.client_profile_1, start_at=self.start, end_at=self.end)
        self.assertIn("21 ans", str(reservation_error.exception))
        reservation = self._create_reservation(start_at=self.start, end_at=self.end)
        with patch("payments.services.payment_intents._configure_stripe"), patch(
            "payments.services.payment_intents.stripe.PaymentIntent.create"
        ) as stripe_create:
            with self.assertRaises(PaymentIntentError) as payment_error:
                create_or_reuse_payment_intent(reservation=reservation, requested_by=self.client_user_1)
            self.assertIn("21 ans", str(payment_error.exception))
            stripe_create.assert_not_called()

    def test_refused_document_requires_resubmission(self):
        self.card.status = ClientDocument.Status.REFUSE
        self.card.rejection_reason = "Document illisible"
        self.card.save(update_fields=["status", "rejection_reason"])
        self.api.force_authenticate(self.manager_user)
        response = self.api.post(
            reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk}),
            self.verification_payload(), format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.card.refresh_from_db()
        self.assertEqual(self.card.status, ClientDocument.Status.REFUSE)
        self.assertEqual(self.card.rejection_reason, "Document illisible")

    def test_correction_of_valid_identity_is_audited(self):
        before = self.card.document_number
        self.api.force_authenticate(self.manager_user)
        response = self.api.post(
            reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk}),
            {**self.verification_payload(), "document_number": "CORRECTED-ID", "last_name": "Martin"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], ClientDocument.Status.VALIDE)
        audit = DocumentVerificationChange.objects.get(document=self.card)
        self.assertEqual(audit.manager, self.manager_user)
        self.assertEqual(audit.changes["document_number"], {"before": before, "after": "CORRECTED-ID"})
        self.assertIsNotNone(audit.created_at)
        self.client_user_1.refresh_from_db()
        self.assertEqual(self.client_user_1.last_name, "Martin")
        detail = self.api.get(reverse("accounts:management-documents-detail", kwargs={"pk": self.card.pk}))
        self.assertEqual(detail.data["document_number"], "CORRECTED-ID")
        self.assertEqual(detail.data["status"], ClientDocument.Status.VALIDE)

    def test_client_can_declare_birth_date_before_21st_birthday(self):
        start_date = timezone.localtime(self.start).date()
        birth_date = ClientProfile._subtract_years(start_date, 21)
        self.card.status = ClientDocument.Status.EN_ATTENTE
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["status", "verified_date_of_birth"])
        self.api.force_authenticate(self.client_user_1)
        response = self.api.patch(
            reverse("accounts:users-me"),
            {"date_of_birth": birth_date.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.client_profile_1.refresh_from_db()
        self.card.verified_date_of_birth = birth_date
        self.card.status = ClientDocument.Status.VALIDE
        self.card.save(update_fields=["verified_date_of_birth", "status"])
        recalculate_profile_status(self.client_profile_1)
        self.client_profile_1.refresh_from_db()
        self.assertTrue(self.eligibility().is_eligible)

    def test_legacy_card_without_verified_date_blocks_payment(self):
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["verified_date_of_birth"])
        reservation = self._create_reservation(start_at=self.start, end_at=self.end)
        with self.assertRaises(PaymentIntentError) as error:
            _assert_profile_still_valid(reservation)
        self.assertIn("vérifier votre date de naissance", error.exception.message)
        with patch("payments.services.payment_intents._configure_stripe"), patch(
            "payments.services.payment_intents.stripe.PaymentIntent.create"
        ) as stripe_create:
            with self.assertRaises(PaymentIntentError):
                create_or_reuse_payment_intent(reservation=reservation, requested_by=self.client_user_1)
            stripe_create.assert_not_called()
        with self.assertRaises(DepositAuthorizationError) as deposit_error:
            _validate_request_context(reservation=reservation, requested_by=self.client_user_1)
        self.assertIn("vérifier votre date de naissance", deposit_error.exception.message)
        self.assertIn("IDENTITY_CARD_BIRTH_DATE_UNVERIFIED", self.eligibility().errors)
        self.card.refresh_from_db()
        self.assertEqual(self.card.status, ClientDocument.Status.VALIDE)

    def test_expired_card_blocks_payment(self):
        self.card.expiration_date = timezone.localdate() - timedelta(days=1)
        self.card.save(update_fields=["expiration_date"])
        reservation = self._create_reservation(start_at=self.start, end_at=self.end)
        with self.assertRaises(PaymentIntentError):
            _assert_profile_still_valid(reservation)
        self.assertIn("IDENTITY_CARD_EXPIRED", self.eligibility().errors)

    def test_changed_profile_date_blocks_eligibility(self):
        self.card.verified_date_of_birth = self.card.verified_date_of_birth - timedelta(days=1)
        self.card.save(update_fields=["verified_date_of_birth"])
        self.assertIn("IDENTITY_CARD_BIRTH_DATE_MISMATCH", self.eligibility().errors)

    def test_age_uses_verified_date_even_if_profile_differs(self):
        self.card.verified_date_of_birth = ClientProfile._subtract_years(timezone.localdate(), 20)
        self.card.save(update_fields=["verified_date_of_birth"])
        self.assertIn("IDENTITY_CARD_BIRTH_DATE_MISMATCH", self.eligibility().errors)
        self.assertIn("UNDER_MINIMUM_AGE", self.eligibility().errors)
        self.card.verified_date_of_birth = ClientProfile._subtract_years(timezone.localdate(), 25)
        self.card.save(update_fields=["verified_date_of_birth"])
        self.client_profile_1.date_of_birth = ClientProfile._subtract_years(timezone.localdate(), 20)
        self.client_profile_1.save(update_fields=["date_of_birth"])
        self.assertIn("IDENTITY_CARD_BIRTH_DATE_MISMATCH", self.eligibility().errors)
        self.assertNotIn("UNDER_MINIMUM_AGE", self.eligibility().errors)

    def test_invalid_or_future_birth_dates_are_rejected_by_both_endpoints(self):
        self.card.status = ClientDocument.Status.EN_ATTENTE
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["status", "verified_date_of_birth"])
        url = reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk})
        for value in ("2024-02-30", (timezone.localdate() + timedelta(days=1)).isoformat()):
            self.api.force_authenticate(self.client_user_1)
            self.assertEqual(self.api.patch(reverse("accounts:users-me"), {"date_of_birth": value}, format="json").status_code, 400)
            self.api.force_authenticate(self.manager_user)
            response = self.api.post(url, {**self.verification_payload(), "verified_date_of_birth": value}, format="json")
            self.assertEqual(response.status_code, 400)
        self.card.refresh_from_db()
        self.assertEqual(self.card.status, ClientDocument.Status.EN_ATTENTE)

    def test_client_cannot_read_or_change_verified_date(self):
        self.api.force_authenticate(self.client_user_1)
        url = reverse("accounts:users-me-documents-detail", kwargs={"pk": self.card.pk})
        response = self.api.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("verified_date_of_birth", response.data)
        self.api.patch(url, {"verified_date_of_birth": "2000-01-01"}, format="json")
        self.card.refresh_from_db()
        self.assertEqual(self.card.verified_date_of_birth, self.client_profile_1.date_of_birth)

    def test_replacement_does_not_inherit_verified_date(self):
        replacement = ClientDocument.objects.create(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="replacement-id",
            file="client_documents/replacement.pdf",
            expiration_date=timezone.localdate() + timedelta(days=365),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )
        self.assertIsNone(replacement.verified_date_of_birth)
        self.assertFalse(self.eligibility().is_eligible)

    def verification_payload(self):
        return {
            "first_name": self.client_user_1.first_name,
            "last_name": self.client_user_1.last_name,
            "verified_date_of_birth": self.client_profile_1.date_of_birth.isoformat(),
            "document_number": self.card.document_number,
            "expiration_date": self.card.expiration_date.isoformat(),
        }

    def test_only_manager_can_correct_and_verify_identity(self):
        self.card.status = ClientDocument.Status.EN_ATTENTE
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["status", "verified_date_of_birth"])
        url = reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk})
        self.api.force_authenticate(self.client_user_1)
        self.assertEqual(self.api.post(url, {"verified_date_of_birth": "1990-01-01"}, format="json").status_code, 403)
        self.api.force_authenticate(self.manager_user)
        self.assertEqual(self.api.post(url, {}, format="json").status_code, 400)
        mismatch = self.client_profile_1.date_of_birth - timedelta(days=1)
        payload = {**self.verification_payload(), "verified_date_of_birth": mismatch.isoformat(),
                   "first_name": "Sophie", "last_name": "Martin", "document_number": "ID-VERIFIED"}
        with patch("accounts.views.documents.create_system_log"):
            response = self.api.post(url, payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.card.refresh_from_db()
        self.client_profile_1.refresh_from_db()
        self.client_user_1.refresh_from_db()
        self.assertEqual(self.card.verified_date_of_birth, mismatch)
        self.assertEqual(self.client_profile_1.date_of_birth, mismatch)
        self.assertEqual((self.client_user_1.first_name, self.client_user_1.last_name), ("Sophie", "Martin"))
        self.assertEqual(self.card.document_number, "ID-VERIFIED")
        audit = DocumentVerificationChange.objects.get(document=self.card)
        self.assertEqual(audit.manager, self.manager_user)
        self.assertIn("document_number", audit.changes)
        self.assertIn("first_name", audit.changes)

    def test_manager_cannot_validate_missing_or_incoherent_data(self):
        self.api.force_authenticate(self.manager_user)
        url = reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk})
        for field, value in (
            ("first_name", ""),
            ("document_number", "  "),
            ("expiration_date", (timezone.localdate() - timedelta(days=1)).isoformat()),
            ("verified_date_of_birth", (timezone.localdate() + timedelta(days=1)).isoformat()),
        ):
            payload = {**self.verification_payload(), field: value}
            response = self.api.post(url, payload, format="json")
            self.assertEqual(response.status_code, 400)
        self.assertFalse(DocumentVerificationChange.objects.filter(document=self.card).exists())

    def test_client_identity_is_locked_but_contact_remains_editable(self):
        self.api.force_authenticate(self.client_user_1)
        url = reverse("accounts:users-me")
        for field, value in (("first_name", "Sophie"), ("last_name", "Martin"), ("date_of_birth", "2001-01-01")):
            response = self.api.patch(url, {field: value}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn(field, response.data)
        response = self.api.patch(url, {"phone": "0123456789", "address": "Rue de test 42"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["identity_locked"])

    def test_rejected_unverified_identity_does_not_lock_profile(self):
        self.card.status = ClientDocument.Status.REFUSE
        self.card.verified_date_of_birth = None
        self.card.validated_at = timezone.now()
        self.card.save(update_fields=["status", "verified_date_of_birth", "validated_at"])
        self.api.force_authenticate(self.client_user_1)
        response = self.api.patch(reverse("accounts:users-me"), {"first_name": "Sophie"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["identity_locked"])

    def test_lock_survives_replacement_and_expiration(self):
        self.card.expiration_date = timezone.localdate() - timedelta(days=1)
        self.card.save(update_fields=["expiration_date"])
        ClientDocument.objects.create(
            client=self.client_profile_1, document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="new-id", file="client_documents/new.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.EN_ATTENTE, is_active=True,
        )
        self.api.force_authenticate(self.client_user_1)
        response = self.api.patch(reverse("accounts:users-me"), {"last_name": "Martin"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_manager_license_correction_does_not_change_identity(self):
        license_doc = ClientDocument.objects.get(
            client=self.client_profile_1, document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        original = (self.client_user_1.first_name, self.client_user_1.last_name, self.client_profile_1.date_of_birth)
        self.api.force_authenticate(self.manager_user)
        response = self.api.post(
            reverse("accounts:management-documents-validate", kwargs={"pk": license_doc.pk}),
            {"document_number": "LICENSE-CORRECTED", "expiration_date": license_doc.expiration_date.isoformat(),
             "driving_license_transmission": "AUTOMATIC_ONLY"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        license_doc.refresh_from_db()
        self.client_user_1.refresh_from_db()
        self.client_profile_1.refresh_from_db()
        self.assertEqual(license_doc.document_number, "LICENSE-CORRECTED")
        self.assertEqual(license_doc.driving_license_transmission, "AUTOMATIC_ONLY")
        self.assertEqual((self.client_user_1.first_name, self.client_user_1.last_name, self.client_profile_1.date_of_birth), original)
        self.assertTrue(DocumentVerificationChange.objects.filter(document=license_doc, manager=self.manager_user).exists())
        self.api.force_authenticate(self.client_user_1)
        response = self.api.patch(
            reverse("accounts:users-me-documents-detail", kwargs={"pk": license_doc.pk}),
            {"document_number": "TAMPERED", "driving_license_transmission": "MANUAL_AND_AUTOMATIC"},
            format="json",
        )
        self.assertEqual(response.status_code, 405)
        license_doc.refresh_from_db()
        self.assertEqual(license_doc.document_number, "LICENSE-CORRECTED")
        self.assertEqual(license_doc.driving_license_transmission, "AUTOMATIC_ONLY")

    def test_legacy_card_reverification_does_not_change_historical_reservation(self):
        reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE, start_at=self.start, end_at=self.end)
        original = (reservation.status, reservation.rental_amount, reservation.confirmed_at)
        self.card.verified_date_of_birth = None
        self.card.save(update_fields=["verified_date_of_birth"])
        self.api.force_authenticate(self.manager_user)
        response = self.api.post(
            reverse("accounts:management-documents-validate", kwargs={"pk": self.card.pk}),
            self.verification_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        reservation.refresh_from_db()
        self.assertEqual((reservation.status, reservation.rental_amount, reservation.confirmed_at), original)
