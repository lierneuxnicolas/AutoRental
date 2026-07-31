from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role

from .utils import ensure_roles


class JwtAuthenticationTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        user_model = get_user_model()
        self.confirmed_user = user_model.objects.create_user(
            email="confirmed@example.com",
            password="StrongPass123!",
            first_name="Confirmed",
            last_name="User",
            phone="0102030405",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.unconfirmed_user = user_model.objects.create_user(
            email="pending@example.com",
            password="StrongPass123!",
            first_name="Pending",
            last_name="User",
            phone="0102030406",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
            is_active=True,
        )
        self.inactive_user = user_model.objects.create_user(
            email="inactive@example.com",
            password="StrongPass123!",
            first_name="Inactive",
            last_name="User",
            phone="0102030407",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=False,
        )

        self.login_url = reverse("accounts:auth-login")
        self.refresh_url = reverse("accounts:auth-token-refresh")
        self.logout_url = reverse("accounts:auth-logout")

    def login_confirmed_user(self):
        payload = {"email": "confirmed@example.com", "password": "StrongPass123!"}
        return self.client.post(self.login_url, payload, format="json")

    def test_login_success_returns_access_refresh_and_user_structure(self):
        response = self.login_confirmed_user()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "confirmed@example.com")
        self.assertNotIn("password", response.data["user"])

    def test_login_rejects_wrong_password(self):
        response = self.client.post(
            self.login_url,
            {"email": "confirmed@example.com", "password": "WrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_rejects_inactive_user(self):
        response = self.client.post(
            self.login_url,
            {"email": "inactive@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_rejects_unverified_email(self):
        response = self.client.post(
            self.login_url,
            {"email": "pending@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_with_valid_token(self):
        login_response = self.login_confirmed_user()
        refresh = login_response.data["refresh"]

        response = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_logout_blacklists_refresh_and_rejects_future_refresh(self):
        login_response = self.login_confirmed_user()
        access = login_response.data["access"]
        refresh = login_response.data["refresh"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout_response = self.client.post(self.logout_url, {"refresh": refresh}, format="json")
        self.assertEqual(logout_response.status_code, status.HTTP_205_RESET_CONTENT)

        refresh_response = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertNotEqual(refresh_response.status_code, status.HTTP_200_OK)

    def test_logout_rejects_invalid_refresh_token(self):
        login_response = self.login_confirmed_user()
        access = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post(self.logout_url, {"refresh": "invalid-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
