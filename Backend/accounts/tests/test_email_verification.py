from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.signing import SignatureExpired
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from accounts.services.email_verification import generate_email_verification_token
from notifications.models import Notification

from .utils import ensure_roles


@override_settings(EMAIL_VERIFICATION_MAX_AGE=86400)
class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="verifyme@example.com",
            password="StrongPass123!",
            first_name="Verify",
            last_name="Me",
            phone="0102030405",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
            is_active=True,
        )
        self.url = reverse("accounts:auth-verify-email")

    def test_email_verification_with_valid_token(self):
        token = generate_email_verification_token(self.user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertTrue(
            Notification.objects.filter(
                user=self.user,
                notification_type="EMAIL_VERIFIED",
                title="Adresse e-mail confirmee",
                related_object_type="user",
                related_object_id=self.user.id,
            ).exists()
        )

    def test_email_verification_rejects_invalid_token(self):
        response = self.client.post(self.url, {"token": "invalid-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_email_verification_rejects_expired_token(self):
        token = generate_email_verification_token(self.user)

        with patch(
            "accounts.services.email_verification.loads",
            side_effect=SignatureExpired("expired"),
        ):
            response = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_email_verification_rejects_reused_token(self):
        token = generate_email_verification_token(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(self.url, {"token": token}, format="json")
        second = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            Notification.objects.filter(user=self.user, notification_type="EMAIL_VERIFIED").count(),
            1,
        )

    def test_email_verification_rejects_token_for_old_email(self):
        token = generate_email_verification_token(self.user)
        self.user.email = "changed@example.com"
        self.user.save(update_fields=["email"])

        response = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
