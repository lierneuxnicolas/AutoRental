from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from common.models import SystemLog

from .utils import create_user, ensure_roles


class AdminUsersApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.url = reverse("accounts:admin-users")
        self.status_url = lambda user_id: reverse("accounts:admin-users-status", kwargs={"pk": user_id})

        self.admin_user = create_user(
            email="admin-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.ADMINISTRATEUR],
            is_superuser=False,
        )
        self.client_user = create_user(
            email="client-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        self.manager_user = create_user(
            email="manager-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        self.mechanic_user = create_user(
            email="mechanic-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.MECANICIEN],
        )
        self.cleaner_user = create_user(
            email="cleaner-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.NETTOYEUR],
        )
        self.inactive_user = create_user(
            email="inactive-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            is_active=False,
        )
        self.unverified_user = create_user(
            email="not-verified-users@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=False,
        )

    def _authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_admin_can_list_users(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)
        self.assertGreaterEqual(response.data["count"], 7)

    def test_client_forbidden(self):
        self._authenticate(self.client_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_forbidden(self):
        self._authenticate(self.manager_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mechanic_forbidden(self):
        self._authenticate(self.mechanic_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cleaner_forbidden(self):
        self._authenticate(self.cleaner_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_forbidden(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_not_present_in_response(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data["results"]:
            self.assertNotIn("password", item)

    def test_search_by_email(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"search": "mechanic-users@example.com"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "mechanic-users@example.com")

    def test_filter_by_role(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"role": Role.Code.GESTIONNAIRE_COMPTABLE})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["role"], Role.Code.GESTIONNAIRE_COMPTABLE)

    def test_filter_by_is_active(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"is_active": "false"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "inactive-users@example.com")
        self.assertFalse(response.data["results"][0]["is_active"])

    def test_filter_by_email_verified(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"email_verified": "false"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], "not-verified-users@example.com")
        self.assertFalse(response.data["results"][0]["email_verified"])

    def test_ordering_by_email(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"ordering": "email"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [item["email"] for item in response.data["results"]]
        self.assertEqual(emails, sorted(emails))

    def test_admin_can_deactivate_client(self):
        self._authenticate(self.admin_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertFalse(self.client_user.is_active)
        self.assertFalse(response.data["is_active"])

        log = SystemLog.objects.filter(action="USER_DEACTIVATED").latest("created_at")
        self.assertEqual(log.user, self.admin_user)
        self.assertEqual(log.level, SystemLog.Level.WARNING)
        self.assertIn(self.client_user.email, log.message)

    def test_admin_can_reactivate_client(self):
        self.client_user.is_active = False
        self.client_user.save(update_fields=["is_active"])

        self._authenticate(self.admin_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertTrue(self.client_user.is_active)
        self.assertTrue(response.data["is_active"])

        log = SystemLog.objects.filter(action="USER_ACTIVATED").latest("created_at")
        self.assertEqual(log.user, self.admin_user)
        self.assertEqual(log.level, SystemLog.Level.INFO)
        self.assertIn(self.client_user.email, log.message)

    def test_client_cannot_change_status(self):
        self._authenticate(self.client_user)

        response = self.client.patch(
            self.status_url(self.admin_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_change_status(self):
        self._authenticate(self.manager_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mechanic_cannot_change_status(self):
        self._authenticate(self.mechanic_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cleaner_cannot_change_status(self):
        self._authenticate(self.cleaner_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_change_status(self):
        response = self.client.patch(
            self.status_url(self.client_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_is_active_is_rejected(self):
        self._authenticate(self.admin_user)

        response = self.client.patch(
            self.status_url(self.client_user.id),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_cannot_deactivate_self(self):
        self._authenticate(self.admin_user)

        response = self.client.patch(
            self.status_url(self.admin_user.id),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Vous ne pouvez pas désactiver votre propre compte.")

    def test_unknown_user_returns_404(self):
        self._authenticate(self.admin_user)

        response = self.client.patch(
            self.status_url(999999),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
