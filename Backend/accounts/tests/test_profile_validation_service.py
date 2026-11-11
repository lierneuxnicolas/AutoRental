from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile, Role
from accounts.services.profile_status import (
    get_effective_document_status,
    recalculate_profile_status,
)
from accounts.services.profile_validation import validate_client_for_reservation

from .utils import create_user, ensure_roles


class ProfileValidationServiceTests(TestCase):
    def setUp(self):
        self.roles = ensure_roles()

        self.user = create_user(
            email="eligibility-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.profile = ClientProfile.objects.create(
            user=self.user,
            date_of_birth=date(1990, 1, 1),
            address="Rue Test",
            profile_status=ClientProfile.ProfileStatus.VALIDE,
        )
        self.start_date = timezone.localdate() + timedelta(days=5)
        self.end_date = self.start_date + timedelta(days=7)

    def _create_document(self, doc_type, expiration_date):
        license_details = {}
        if doc_type == ClientDocument.DocumentType.PERMIS_CONDUIRE:
            license_details = {
                "driving_license_category": ClientDocument.DrivingLicenseCategory.B,
                "driving_license_transmission": ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC,
            }
        elif doc_type == ClientDocument.DocumentType.CARTE_IDENTITE:
            license_details = {"verified_date_of_birth": self.profile.date_of_birth}
        return ClientDocument.objects.create(
            client=self.profile,
            document_type=doc_type,
            document_number=f"VAL-{doc_type}",
            file="client_documents/service.pdf",
            expiration_date=expiration_date,
            status=ClientDocument.Status.VALIDE,
            is_active=True,
            **license_details,
        )

    def _make_fully_valid_documents(self):
        expiration = self.end_date + timedelta(days=30)
        self._create_document(ClientDocument.DocumentType.CARTE_IDENTITE, expiration)
        self._create_document(ClientDocument.DocumentType.PERMIS_CONDUIRE, expiration)

    def test_valid_client_is_eligible(self):
        self._make_fully_valid_documents()
        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.errors, ())

    def test_email_not_verified(self):
        self._make_fully_valid_documents()
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("EMAIL_NOT_VERIFIED", result.errors)

    def test_profile_incomplete(self):
        self._make_fully_valid_documents()
        self.user.first_name = ""
        self.user.save(update_fields=["first_name"])

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("PROFILE_INCOMPLETE", result.errors)

    def test_client_under_21(self):
        self._make_fully_valid_documents()
        self.profile.date_of_birth = self.start_date - timedelta(days=20 * 365)
        self.profile.save(update_fields=["date_of_birth"])
        ClientDocument.objects.filter(client=self.profile, document_type=ClientDocument.DocumentType.CARTE_IDENTITE).update(
            verified_date_of_birth=self.profile.date_of_birth,
        )

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("UNDER_MINIMUM_AGE", result.errors)

    def test_client_exactly_21_on_reservation_start_is_eligible(self):
        self._make_fully_valid_documents()
        self.profile.date_of_birth = ClientProfile._subtract_years(self.start_date, 21)
        self.profile.save(update_fields=["date_of_birth"])
        ClientDocument.objects.filter(client=self.profile, document_type=ClientDocument.DocumentType.CARTE_IDENTITE).update(
            verified_date_of_birth=self.profile.date_of_birth,
        )

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)

        self.assertTrue(result.is_eligible)
        self.assertNotIn("UNDER_MINIMUM_AGE", result.errors)

    def test_identity_card_missing(self):
        self._create_document(ClientDocument.DocumentType.PERMIS_CONDUIRE, self.end_date + timedelta(days=30))

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("IDENTITY_CARD_MISSING", result.errors)

    def test_driving_license_missing(self):
        self._create_document(ClientDocument.DocumentType.CARTE_IDENTITE, self.end_date + timedelta(days=30))

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("DRIVING_LICENSE_MISSING", result.errors)

    def test_identity_card_expires_before_end(self):
        self._create_document(ClientDocument.DocumentType.CARTE_IDENTITE, self.end_date - timedelta(days=1))
        self._create_document(ClientDocument.DocumentType.PERMIS_CONDUIRE, self.end_date + timedelta(days=30))

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("IDENTITY_CARD_EXPIRES_TOO_SOON", result.errors)

    def test_driving_license_expires_before_end(self):
        self._create_document(ClientDocument.DocumentType.CARTE_IDENTITE, self.end_date + timedelta(days=30))
        self._create_document(ClientDocument.DocumentType.PERMIS_CONDUIRE, self.end_date - timedelta(days=1))

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("DRIVING_LICENSE_EXPIRES_TOO_SOON", result.errors)

    def test_documents_valid_until_end(self):
        self._make_fully_valid_documents()
        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)

        self.assertTrue(result.is_eligible)

    def test_expired_document_makes_profile_incomplete_until_replacement_is_validated(self):
        today = timezone.localdate()
        identity = self._create_document(
            ClientDocument.DocumentType.CARTE_IDENTITE,
            today + timedelta(days=30),
        )
        license_document = self._create_document(
            ClientDocument.DocumentType.PERMIS_CONDUIRE,
            today + timedelta(days=30),
        )
        self.assertEqual(recalculate_profile_status(self.profile), ClientProfile.ProfileStatus.VALIDE)

        identity.expiration_date = today - timedelta(days=1)
        identity.save(update_fields=["expiration_date"])
        self.assertEqual(recalculate_profile_status(self.profile), ClientProfile.ProfileStatus.INCOMPLET)
        identity.refresh_from_db()
        self.assertEqual(identity.status, ClientDocument.Status.VALIDE)

        identity.is_active = False
        identity.save(update_fields=["is_active"])
        replacement = self._create_document(
            ClientDocument.DocumentType.CARTE_IDENTITE,
            today + timedelta(days=90),
        )
        replacement.status = ClientDocument.Status.EN_ATTENTE
        replacement.save(update_fields=["status"])
        self.assertNotEqual(recalculate_profile_status(self.profile), ClientProfile.ProfileStatus.VALIDE)

        replacement.status = ClientDocument.Status.VALIDE
        replacement.save(update_fields=["status"])
        self.assertEqual(recalculate_profile_status(self.profile), ClientProfile.ProfileStatus.VALIDE)
        license_document.refresh_from_db()
        self.assertEqual(license_document.status, ClientDocument.Status.VALIDE)

    def test_valid_document_keeps_valid_effective_status(self):
        document = self._create_document(
            ClientDocument.DocumentType.CARTE_IDENTITE,
            timezone.localdate() + timedelta(days=1),
        )

        self.assertEqual(get_effective_document_status(document), ClientDocument.Status.VALIDE)

    def test_pending_and_refused_documents_keep_their_status_after_expiration(self):
        today = timezone.localdate()
        pending = self._create_document(
            ClientDocument.DocumentType.CARTE_IDENTITE,
            today - timedelta(days=1),
        )
        pending.status = ClientDocument.Status.EN_ATTENTE
        pending.save(update_fields=["status"])
        refused = self._create_document(
            ClientDocument.DocumentType.PERMIS_CONDUIRE,
            today - timedelta(days=1),
        )
        refused.status = ClientDocument.Status.REFUSE
        refused.save(update_fields=["status"])

        self.assertEqual(get_effective_document_status(pending), ClientDocument.Status.EN_ATTENTE)
        self.assertEqual(get_effective_document_status(refused), ClientDocument.Status.REFUSE)

    def test_inactive_user(self):
        self._make_fully_valid_documents()
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("ACCOUNT_INACTIVE", result.errors)

    def test_wrong_role(self):
        self._make_fully_valid_documents()
        self.user.role = self.roles[Role.Code.GESTIONNAIRE_COMPTABLE]
        self.user.save(update_fields=["role"])

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("INVALID_ROLE", result.errors)

    def test_invalid_parameters_raise_validation_error(self):
        with self.assertRaises(ValidationError):
            validate_client_for_reservation(None, self.start_date, self.end_date)
