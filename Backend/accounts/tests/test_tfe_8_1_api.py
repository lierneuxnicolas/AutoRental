from datetime import date, timedelta

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
class Tfe81AccountsApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()

        self.register_url = reverse("accounts:auth-register")
        self.login_url = reverse("accounts:auth-login")
        self.me_url = reverse("accounts:auth-me")
        self.profile_url = reverse("accounts:users-me")
        self.documents_url = reverse("accounts:users-me-documents")
        self.management_documents_url = reverse("accounts:management-documents")

        self.client_user = create_user(
            email="tfe81-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
        )
        self.profile = ClientProfile.objects.create(
            user=self.client_user,
            date_of_birth=date(1990, 1, 1),
            address="Rue API 8.1",
            profile_status=ClientProfile.ProfileStatus.INCOMPLET,
        )

    def _authenticate_client(self):
        response = self.client.post(
            self.login_url,
            {"email": "tfe81-client@example.com", "password": "StrongPass123!"},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_01_register_valid_user_returns_201(self):
        payload = {
            "email": "tfe81-register@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "first_name": "Alice",
            "last_name": "Martin",
            "phone": "0123456789",
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_02_register_duplicate_email_returns_400(self):
        payload = {
            "email": "tfe81-client@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "first_name": "Dup",
            "last_name": "User",
            "phone": "0101010101",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_03_login_valid_credentials_returns_200_with_jwt_tokens(self):
        response = self.client.post(
            self.login_url,
            {"email": "tfe81-client@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_04_login_wrong_password_returns_401(self):
        response = self.client.post(
            self.login_url,
            {"email": "tfe81-client@example.com", "password": "WrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_05_get_connected_user_profile_returns_200(self):
        self._authenticate_client()

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "tfe81-client@example.com")

    def test_06_patch_profile_valid_data_returns_200_and_persists(self):
        self._authenticate_client()

        response = self.client.patch(
            self.profile_url,
            {
                "first_name": "Nora",
                "last_name": "Dupont",
                "phone": "0499001122",
                "date_of_birth": "1992-05-10",
                "address": "Rue Modifiee 42",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.client_user.first_name, "Nora")
        self.assertEqual(self.profile.address, "Rue Modifiee 42")

    def test_07_patch_profile_invalid_data_returns_400(self):
        self._authenticate_client()

        underage_birth_date = date.today().replace(year=date.today().year - 17).isoformat()
        response = self.client.patch(
            self.profile_url,
            {"date_of_birth": underage_birth_date},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_08_upload_valid_client_document_returns_201(self):
        self._authenticate_client()

        payload = {
            "document_type": ClientDocument.DocumentType.CARTE_IDENTITE,
            "document_number": "DOC-TFE81-001",
            "expiration_date": (timezone.localdate() + timedelta(days=60)).isoformat(),
            "file": SimpleUploadedFile("id.pdf", b"%PDF-1.4\n%test\n", content_type="application/pdf"),
        }

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.documents_url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ClientDocument.objects.filter(client=self.profile).exists())

    def test_10_protected_resource_without_auth_returns_401(self):
        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_11_client_accessing_manager_only_endpoint_returns_403(self):
        self._authenticate_client()

        response = self.client.get(self.management_documents_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_12_nonexistent_resource_returns_404(self):
        self._authenticate_client()
        missing_url = reverse("accounts:users-me-documents-detail", kwargs={"pk": 999999})

        response = self.client.get(missing_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
