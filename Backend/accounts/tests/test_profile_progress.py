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

    def _create_document(self, *, doc_type, status_value, expiration_date, is_active=True):
        return ClientDocument.objects.create(
            client=self.profile,
            document_type=doc_type,
            document_number=f"DOC-{doc_type}-{status_value}-{int(is_active)}",
            file="client_documents/test.pdf",
            expiration_date=expiration_date,
            status=status_value,
            is_active=is_active,
        )

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

        self._authenticate()
        progress = self._get_progress()
        self.assertEqual(progress["percentage"], 60)
