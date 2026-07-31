from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role

from .utils import ensure_roles


class MeEndpointTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="me@example.com",
            password="StrongPass123!",
            first_name="Me",
            last_name="Endpoint",
            phone="0102030405",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.login_url = reverse("accounts:auth-login")
        self.me_url = reverse("accounts:auth-me")

    def authenticate(self):
        login_response = self.client.post(
            self.login_url,
            {"email": "me@example.com", "password": "StrongPass123!"},
            format="json",
        )
        token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_me_requires_authentication(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_expected_user_data_without_password(self):
        self.authenticate()
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "me@example.com")
        self.assertEqual(response.data["role"], Role.Code.CLIENT)
        self.assertIn("id", response.data)
        self.assertNotIn("password", response.data)
