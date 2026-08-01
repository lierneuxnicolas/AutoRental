from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from notifications.models import Notification

from .utils import ensure_roles


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://localhost:3000",
)
class PasswordResetTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="resetme@example.com",
            password="OldStrongPass123!",
            first_name="Reset",
            last_name="Me",
            phone="0102030405",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )

        self.request_url = reverse("accounts:auth-password-reset")
        self.confirm_url = reverse("accounts:auth-password-reset-confirm")
        self.login_url = reverse("accounts:auth-login")

    def _reset_token_payload(self, user=None):
        target = user or self.user
        uid = urlsafe_base64_encode(force_bytes(target.pk))
        token = default_token_generator.make_token(target)
        return uid, token

    def test_password_reset_request_existing_email_sends_email(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.request_url,
                {"email": "resetme@example.com"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"message": "Si un compte correspond a cette adresse, un e-mail a ete envoye."},
        )
        self.assertNotIn("user", response.data)
        self.assertNotIn("detail", response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password?uid=", mail.outbox[0].body)
        self.assertIn("&token=", mail.outbox[0].body)

    def test_password_reset_request_unknown_email_returns_same_message_and_no_email(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.request_url,
                {"email": "missing@example.com"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"message": "Si un compte correspond a cette adresse, un e-mail a ete envoye."},
        )
        self.assertEqual(len(mail.outbox), 0)
        self.assertNotIn("user", response.data)
        self.assertNotIn("detail", response.data)

    def test_password_reset_confirm_valid_token_changes_password_and_creates_notification(self):
        uid, token = self._reset_token_payload()

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "NewStrongPass456!",
                "new_password_confirm": "NewStrongPass456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"message": "Mot de passe reinitialise."})
        self.assertTrue(
            Notification.objects.filter(user=self.user, notification_type="PASSWORD_CHANGED").exists()
        )

        self.assertEqual(
            self.client.post(
                self.login_url,
                {"email": "resetme@example.com", "password": "OldStrongPass123!"},
                format="json",
            ).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.post(
                self.login_url,
                {"email": "resetme@example.com", "password": "NewStrongPass456!"},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )

    def test_password_reset_confirm_rejects_reused_token(self):
        uid, token = self._reset_token_payload()
        first = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "NewStrongPass456!",
                "new_password_confirm": "NewStrongPass456!",
            },
            format="json",
        )
        second = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "AnotherStrongPass789!",
                "new_password_confirm": "AnotherStrongPass789!",
            },
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_confirm_rejects_invalid_token(self):
        uid, _ = self._reset_token_payload()

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": "invalid-token",
                "new_password": "NewStrongPass456!",
                "new_password_confirm": "NewStrongPass456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_confirm_rejects_invalid_uid(self):
        response = self.client.post(
            self.confirm_url,
            {
                "uid": "invalid-uid",
                "token": "invalid-token",
                "new_password": "NewStrongPass456!",
                "new_password_confirm": "NewStrongPass456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_confirm_rejects_weak_password(self):
        uid, token = self._reset_token_payload()

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "123",
                "new_password_confirm": "123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)

    def test_password_reset_confirm_rejects_password_confirmation_mismatch(self):
        uid, token = self._reset_token_payload()

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "NewStrongPass456!",
                "new_password_confirm": "MismatchPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)
