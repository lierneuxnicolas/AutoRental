from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.signing import SignatureExpired
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from accounts.services.email_verification import (
    EMAIL_VERIFICATION_SALT,
    generate_email_verification_token,
)
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
        self.assertEqual(response.data.get("detail"), "Le jeton de confirmation est invalide.")
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)
        self.assertFalse(
            Notification.objects.filter(user=self.user, notification_type="EMAIL_VERIFIED").exists()
        )

    def test_email_verification_rejects_expired_token(self):
        user_model = get_user_model()
        expired_user = user_model.objects.create_user(
            email="expired.token@autorental.local",
            password="StrongPass123!",
            first_name="Expired",
            last_name="Token",
            phone="0605040302",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
            is_active=True,
        )
        token = generate_email_verification_token(expired_user)

        # Guardrail: ensure we generated a real, valid token with the production mechanism.
        from django.core.signing import loads

        payload = loads(token, salt=EMAIL_VERIFICATION_SALT, max_age=86400)
        self.assertEqual(payload["user_id"], expired_user.id)
        self.assertEqual(payload["email"], expired_user.email)

        with patch(
            "accounts.services.email_verification.loads",
            side_effect=SignatureExpired("expired"),
        ):
            response = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("detail"), "Le lien de confirmation a expire.")
        expired_user.refresh_from_db()
        self.assertFalse(expired_user.email_verified)
        self.assertFalse(
            Notification.objects.filter(user=expired_user, notification_type="EMAIL_VERIFIED").exists()
        )

    def test_email_verification_rejects_reused_token(self):
        token = generate_email_verification_token(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(self.url, {"token": token}, format="json")
        second = self.client.post(self.url, {"token": token}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.data.get("detail"), "Ce lien de confirmation a deja ete utilise.")
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
