from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientProfile, Role
from notifications.models import Notification

from .utils import ensure_roles


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://localhost:3000",
)
class RegistrationTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.url = reverse("accounts:auth-register")
        self.payload = {
            "email": "newclient@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "first_name": "Alice",
            "last_name": "Martin",
            "phone": "0123456789",
        }

    def test_registration_success_sets_client_role_profile_and_security_flags(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("user", response.data)
        self.assertNotIn("password", response.data)
        self.assertNotIn("password", response.data["user"])

        user_model = get_user_model()
        user = user_model.objects.get(email="newclient@example.com")
        self.assertEqual(user.role.code, Role.Code.CLIENT)
        self.assertFalse(user.email_verified)
        self.assertTrue(user.check_password("StrongPass123!"))
        self.assertNotEqual(user.password, "StrongPass123!")

        self.assertTrue(ClientProfile.objects.filter(user=user).exists())
        self.assertTrue(
            Notification.objects.filter(
                user=user,
                notification_type="ACCOUNT_CREATED",
                title="Compte cree",
                related_object_type="user",
                related_object_id=user.id,
            ).exists()
        )

    def test_registration_sends_verification_email(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Confirmez votre adresse e-mail", mail.outbox[0].subject)
        self.assertIn("/verify-email?token=", mail.outbox[0].body)

    def test_registration_rejects_duplicate_email_case_insensitive(self):
        user_model = get_user_model()
        user_model.objects.create_user(
            email="DupLiCate@Example.com",
            password="StrongPass123!",
            first_name="Dup",
            last_name="User",
            phone="0101010101",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
        )

        payload = dict(self.payload)
        payload["email"] = "duplicate@example.com"
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_registration_rejects_weak_password(self):
        payload = dict(self.payload)
        payload["password"] = "123"
        payload["password_confirm"] = "123"

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)

    def test_registration_rejects_password_confirmation_mismatch(self):
        payload = dict(self.payload)
        payload["password_confirm"] = "AnotherPass123!"

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
