from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientDocument, ClientProfile, Role

from .utils import create_user, ensure_roles


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://localhost:3000",
)
class TfeMvpAccountsApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.register_url = reverse("accounts:auth-register")
        self.login_url = reverse("accounts:auth-login")
        self.me_url = reverse("accounts:auth-me")
        self.profile_url = reverse("accounts:users-me")
        self.documents_url = reverse("accounts:users-me-documents")

        self.client_user = create_user(
            email="tfe-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
        )
        self.profile = ClientProfile.objects.create(
            user=self.client_user,
            date_of_birth=date(1990, 1, 1),
            address="Rue de test 1",
            profile_status=ClientProfile.ProfileStatus.INCOMPLET,
        )

    def _auth_as_client(self):
        response = self.client.post(
            self.login_url,
            {"email": "tfe-client@example.com", "password": "StrongPass123!"},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_01_register_valid_user_returns_201(self):
        payload = {
            "email": "tfe-register@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "first_name": "Alice",
            "last_name": "Martin",
            "phone": "0123456789",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(get_user_model().objects.filter(email="tfe-register@example.com").exists())

    def test_02_login_valid_credentials_returns_200_and_tokens(self):
        response = self.client.post(
            self.login_url,
            {"email": "tfe-client@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_03_get_me_authenticated_returns_200(self):
        self._auth_as_client()

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "tfe-client@example.com")

    def test_04_patch_profile_updates_fields_and_returns_200(self):
        self._auth_as_client()

        response = self.client.patch(
            self.profile_url,
            {
                "first_name": "Nora",
                "last_name": "Dupont",
                "phone": "0499001122",
                "date_of_birth": "1992-05-10",
                "address": "Rue API 42",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.client_user.first_name, "Nora")
        self.assertEqual(self.profile.address, "Rue API 42")

    def test_05_upload_client_document_returns_201(self):
        self._auth_as_client()

        file_obj = SimpleUploadedFile(
            "id.pdf",
            b"%PDF-1.4\n%test\n",
            content_type="application/pdf",
        )
        payload = {
            "document_type": ClientDocument.DocumentType.CARTE_IDENTITE,
            "document_number": "DOC-TFE-001",
            "expiration_date": (timezone.localdate() + timedelta(days=45)).isoformat(),
            "file": file_obj,
        }
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.documents_url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ClientDocument.objects.filter(client=self.profile).count(), 1)

    def test_06_unauthorized_and_invalid_requests_return_401_and_400(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth_as_client()
        underage = (timezone.localdate().replace(year=timezone.localdate().year - 17)).isoformat()
        response = self.client.patch(
            self.profile_url,
            {"date_of_birth": underage},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
