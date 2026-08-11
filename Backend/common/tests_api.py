from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from accounts.models import Role
from common.models import BackupRecord, SystemLog

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


class BackupAdminApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.list_url = reverse("common:admin-backups-list")
        self.create_url = reverse("common:admin-backups-create")

        self.admin_user = create_user(
            email="backup-admin@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.ADMINISTRATEUR],
            is_superuser=False,
        )
        self.client_user = create_user(
            email="backup-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )

    def _authenticate(self, user):
        self.client.force_authenticate(user=user)

    def _download_url(self, backup_id: int) -> str:
        return reverse("common:admin-backups-download", args=[backup_id])

    def test_admin_get_history_returns_200(self):
        BackupRecord.objects.create(
            filename="autorental_20260811_010101.sql",
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path="C:/tmp/autorental_20260811_010101.sql",
            file_size=1024,
        )

        self._authenticate(self.admin_user)
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertGreaterEqual(response.data["count"], 1)

    @patch("common.views.create_database_backup")
    def test_admin_post_create_is_authorized(self, mock_create_backup):
        record = BackupRecord.objects.create(
            filename="autorental_20260811_020202.sql",
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path="C:/tmp/autorental_20260811_020202.sql",
            file_size=2048,
        )
        mock_create_backup.return_value = record

        self._authenticate(self.admin_user)
        response = self.client.post(self.create_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["id"], record.id)
        self.assertEqual(response.data["filename"], record.filename)

    def test_client_get_is_forbidden(self):
        self._authenticate(self.client_user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_post_is_forbidden(self):
        self._authenticate(self.client_user)
        response = self.client.post(self.create_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_get_is_unauthorized(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_post_is_unauthorized(self):
        response = self.client.post(self.create_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("common.views.FileResponse")
    def test_admin_can_download_successful_backup(self, mock_file_response):
        def _fake_file_response(file_obj, **kwargs):
            file_obj.close()
            response = HttpResponse(status=200)
            response["Content-Disposition"] = f'attachment; filename="{kwargs.get("filename", "backup.sql")}"'
            return response

        mock_file_response.side_effect = _fake_file_response

        backup_dir = Path(settings.BASE_DIR) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        file_path = backup_dir / "autorental_download_test.sql"
        file_path.write_text("-- sql backup test --", encoding="utf-8")

        try:
            record = BackupRecord.objects.create(
                filename=file_path.name,
                status=BackupRecord.Status.REUSSIE,
                backup_type=BackupRecord.BackupType.DATABASE,
                file_path=str(file_path),
                file_size=file_path.stat().st_size,
            )

            self._authenticate(self.admin_user)
            response = self.client.get(self._download_url(record.id))

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertIn("attachment", response["Content-Disposition"])
            self.assertIn(record.filename, response["Content-Disposition"])
        finally:
            if file_path.exists():
                file_path.unlink()

    def test_client_download_is_forbidden(self):
        record = BackupRecord.objects.create(
            filename="autorental_blocked.sql",
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path=str(Path(settings.BASE_DIR) / "backups" / "autorental_blocked.sql"),
        )

        self._authenticate(self.client_user)
        response = self.client.get(self._download_url(record.id))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_download_is_unauthorized(self):
        record = BackupRecord.objects.create(
            filename="autorental_public.sql",
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path=str(Path(settings.BASE_DIR) / "backups" / "autorental_public.sql"),
        )

        response = self.client.get(self._download_url(record.id))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_download_returns_404_when_backup_not_successful(self):
        record = BackupRecord.objects.create(
            filename="autorental_failed.sql",
            status=BackupRecord.Status.ECHEC,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path=str(Path(settings.BASE_DIR) / "backups" / "autorental_failed.sql"),
        )

        self._authenticate(self.admin_user)
        response = self.client.get(self._download_url(record.id))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_download_returns_404_when_file_is_missing(self):
        missing_path = Path(settings.BASE_DIR) / "backups" / "autorental_missing.sql"
        record = BackupRecord.objects.create(
            filename=missing_path.name,
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path=str(missing_path),
        )

        self._authenticate(self.admin_user)
        response = self.client.get(self._download_url(record.id))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_download_returns_404_when_path_is_outside_backup_directory(self):
        outside_path = Path(settings.BASE_DIR) / "manage.py"
        record = BackupRecord.objects.create(
            filename="manage.py",
            status=BackupRecord.Status.REUSSIE,
            backup_type=BackupRecord.BackupType.DATABASE,
            file_path=str(outside_path),
        )

        self._authenticate(self.admin_user)
        response = self.client.get(self._download_url(record.id))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
