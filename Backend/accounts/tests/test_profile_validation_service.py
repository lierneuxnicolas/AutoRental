from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import ClientDocument, ClientProfile, Role
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
        self.start_date = date.today() + timedelta(days=5)
        self.end_date = self.start_date + timedelta(days=7)

    def _create_document(self, doc_type, expiration_date):
        return ClientDocument.objects.create(
            client=self.profile,
            document_type=doc_type,
            document_number=f"VAL-{doc_type}",
            file="client_documents/service.pdf",
            expiration_date=expiration_date,
            status=ClientDocument.Status.VALIDE,
            is_active=True,
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

        result = validate_client_for_reservation(self.profile, self.start_date, self.end_date)
        self.assertIn("UNDER_MINIMUM_AGE", result.errors)

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
