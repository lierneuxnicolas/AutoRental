from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientDocument, ClientProfile, Role

from .utils import create_user, ensure_roles


class ProfileProgressEndpointTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.progress_url = reverse("accounts:users-me-profile-progress")

        self.user = create_user(
            email="progress-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
        )
        self.profile = ClientProfile.objects.create(
            user=self.user,
            profile_status=ClientProfile.ProfileStatus.INCOMPLET,
        )

    def _authenticate(self):
        self.client.force_authenticate(user=self.user)

    def _get_progress(self):
        response = self.client.get(self.progress_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _create_document(
        self,
        *,
        doc_type,
        status_value,
        expiration_date,
        is_active=True,
        verified_license=True,
    ):
        license_details = {}
        if (
            doc_type == ClientDocument.DocumentType.PERMIS_CONDUIRE
            and status_value == ClientDocument.Status.VALIDE
            and verified_license
        ):
            license_details = {
                "driving_license_category": ClientDocument.DrivingLicenseCategory.B,
                "driving_license_transmission": ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC,
            }
        return ClientDocument.objects.create(
            client=self.profile,
            document_type=doc_type,
            document_number=f"DOC-{doc_type}-{status_value}-{int(is_active)}",
            file="client_documents/test.pdf",
            expiration_date=expiration_date,
            status=status_value,
            is_active=is_active,
            **license_details,
        )

    def _complete_personal_information(self):
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

    def test_progress_exposes_license_transmission_only_when_valid(self):
        self._authenticate()
        self.assertIsNone(self._get_progress()["driving_license_transmission"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=timezone.localdate() + timedelta(days=400),
        )
        progress = self._get_progress()
        self.assertTrue(progress["driving_license_valid"])
        self.assertEqual(progress["driving_license_transmission"], "MANUAL_AND_AUTOMATIC")

    def test_progress_is_20_percent_with_account_only(self):
        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 20)

    def test_progress_is_40_percent_after_email_verification(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 40)

    def test_progress_is_60_percent_with_complete_personal_info(self):
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 60)

    def test_progress_is_80_percent_with_valid_identity_card(self):
        today = timezone.localdate()
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 80)

    def test_progress_is_100_percent_with_valid_identity_and_license(self):
        today = timezone.localdate()
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )
        self._create_document(
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 100)
        self.assertEqual(progress["profile_status"], ClientProfile.ProfileStatus.VALIDE)
        self.assertFalse(progress["needs_client_action"])

    def test_unverified_license_details_do_not_complete_the_profile(self):
        today = timezone.localdate()
        self._complete_personal_information()
        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )
        self._create_document(
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
            verified_license=False,
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 80)
        self.assertFalse(progress["driving_license_valid"])
        self.assertEqual(progress["profile_status"], ClientProfile.ProfileStatus.EN_ATTENTE)
        self.assertFalse(progress["needs_client_action"])
        self.assertEqual(
            progress["driving_license_issue"],
            "Permis de conduire en attente de vérification par un gestionnaire",
        )

    def test_refused_document_is_reported_as_incomplete(self):
        today = timezone.localdate()
        self._complete_personal_information()
        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.REFUSE,
            expiration_date=today + timedelta(days=60),
        )
        self._create_document(
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["profile_status"], ClientProfile.ProfileStatus.INCOMPLET)
        self.assertTrue(progress["needs_client_action"])
        self.assertTrue(progress["documents_need_action"])
        self.assertEqual(progress["identity_card_issue"], "Carte d'identité refusée")

    def test_expired_document_is_not_counted(self):
        today = timezone.localdate()
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today - timedelta(days=1),
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 60)
        self.assertEqual(progress["identity_card_issue"], "Carte d'identité expirée")
        self.assertTrue(progress["needs_client_action"])

    def test_inactive_document_is_not_counted(self):
        today = timezone.localdate()
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
            is_active=False,
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 60)

    def test_pending_document_is_not_counted(self):
        today = timezone.localdate()
        self.user.email_verified = True
        self.user.first_name = "Alice"
        self.user.last_name = "Martin"
        self.user.phone = "0499123456"
        self.user.save(update_fields=["email_verified", "first_name", "last_name", "phone"])
        self.profile.date_of_birth = date(1990, 1, 1)
        self.profile.address = "Rue Test"
        self.profile.save(update_fields=["date_of_birth", "address"])

        self._create_document(
            doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            status_value=ClientDocument.Status.EN_ATTENTE,
            expiration_date=today + timedelta(days=60),
        )
        self._create_document(
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            status_value=ClientDocument.Status.VALIDE,
            expiration_date=today + timedelta(days=60),
        )

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 80)
        self.assertEqual(progress["profile_status"], ClientProfile.ProfileStatus.EN_ATTENTE)
        self.assertFalse(progress["needs_client_action"])
        self.assertEqual(progress["identity_card_issue"], "Carte d'identité en attente de validation")
