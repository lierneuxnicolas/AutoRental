from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientProfile, Role

from .utils import create_user, ensure_roles


class ProfileEndpointsTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.login_url = reverse("accounts:auth-login")
        self.profile_url = reverse("accounts:users-me")

        self.client_user = create_user(
            email="profile-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
        )
        self.profile = ClientProfile.objects.create(
            user=self.client_user,
            date_of_birth=date(1990, 1, 1),
            address="Old address",
            profile_status=ClientProfile.ProfileStatus.INCOMPLET,
        )

    def _authenticate(self, email, password):
        response = self.client.post(
            self.login_url,
            {"email": email, "password": password},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_get_profile_for_client(self):
        self._authenticate("profile-client@example.com", "StrongPass123!")

        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "profile-client@example.com")
        self.assertNotIn("password", response.data)

    def test_patch_updates_allowed_fields(self):
        self._authenticate("profile-client@example.com", "StrongPass123!")

        response = self.client.patch(
            self.profile_url,
            {
                "first_name": "Alice",
                "last_name": "Martin",
                "phone": "0499123456",
                "date_of_birth": "1992-06-30",
                "address": "Rue de la Loi 1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.profile.refresh_from_db()

        self.assertEqual(self.client_user.first_name, "Alice")
        self.assertEqual(self.client_user.last_name, "Martin")
        self.assertEqual(self.client_user.phone, "0499123456")
        self.assertEqual(self.profile.date_of_birth, date(1992, 6, 30))
        self.assertEqual(self.profile.address, "Rue de la Loi 1")

    def test_patch_role_change_is_ignored(self):
        self._authenticate("profile-client@example.com", "StrongPass123!")

        response = self.client.patch(
            self.profile_url,
            {"role": Role.Code.GESTIONNAIRE_COMPTABLE},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.role.code, Role.Code.CLIENT)

    def test_patch_email_verified_change_is_ignored(self):
        self._authenticate("profile-client@example.com", "StrongPass123!")

        response = self.client.patch(
            self.profile_url,
            {"email_verified": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertTrue(self.client_user.email_verified)

    def test_anonymous_user_is_rejected(self):
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_other_role_is_rejected(self):
        manager_user = create_user(
            email="profile-manager@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        ClientProfile.objects.create(user=manager_user)

        self._authenticate("profile-manager@example.com", "StrongPass123!")
        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_profile_is_auto_created_for_legacy_client_without_profile(self):
        legacy_user = create_user(
            email="legacy-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )

        self.assertFalse(ClientProfile.objects.filter(user=legacy_user).exists())

        self._authenticate("legacy-client@example.com", "StrongPass123!")
        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ClientProfile.objects.filter(user=legacy_user).exists())
