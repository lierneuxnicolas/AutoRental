from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from common.models import SystemLog

from accounts.tests.utils import create_user, ensure_roles


class SystemLogListApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.url = reverse("common:admin-system-logs")

        self.admin_user = create_user(
            email="systemlog-admin@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.ADMINISTRATEUR],
            is_superuser=False,
        )
        self.client_user = create_user(
            email="systemlog-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        self.manager_user = create_user(
            email="systemlog-manager@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        self.mechanic_user = create_user(
            email="systemlog-mechanic@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.MECANICIEN],
        )
        self.cleaner_user = create_user(
            email="systemlog-cleaner@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.NETTOYEUR],
        )

        self.log_old = SystemLog.objects.create(
            action="old-action",
            message="Old system log",
            level=SystemLog.Level.INFO,
        )
        self.log_new = SystemLog.objects.create(
            action="new-action",
            message="New system log",
            level=SystemLog.Level.WARNING,
            user=self.admin_user,
        )

    def _authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_admin_can_list_system_logs(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertGreaterEqual(response.data["count"], 2)

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

    def test_logs_are_returned(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = [item["action"] for item in response.data["results"]]
        self.assertIn(self.log_new.action, actions)
        self.assertIn(self.log_old.action, actions)

    def test_logs_are_ordered_newest_first(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = [item["action"] for item in response.data["results"]]
        self.assertEqual(actions[0], self.log_new.action)
        self.assertEqual(actions[1], self.log_old.action)

    def test_search_by_action_and_message(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"search": "new"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action"], self.log_new.action)

    def test_filter_by_level(self):
        self._authenticate(self.admin_user)

        response = self.client.get(self.url, {"level": SystemLog.Level.WARNING})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["level"], SystemLog.Level.WARNING)

    def test_no_modification_or_deletion_endpoints(self):
        self._authenticate(self.admin_user)

        response = self.client.post(self.url, {}, format="json")
        self.assertIn(response.status_code, {status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN})

        response = self.client.patch(self.url, {}, format="json")
        self.assertIn(response.status_code, {status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN})

        response = self.client.put(self.url, {}, format="json")
        self.assertIn(response.status_code, {status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN})

        response = self.client.delete(self.url)
        self.assertIn(response.status_code, {status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN})
