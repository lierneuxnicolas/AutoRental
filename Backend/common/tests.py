from django.contrib.auth import get_user_model
from django.test import TestCase

from common.models import SystemLog


class SystemLogModelTests(TestCase):
    def test_create_info_log(self):
        log = SystemLog.objects.create(action="login", message="User logged in", level=SystemLog.Level.INFO)

        self.assertEqual(log.level, SystemLog.Level.INFO)
        self.assertEqual(log.action, "login")
        self.assertEqual(log.message, "User logged in")
        self.assertIsNone(log.user)
        self.assertIsNotNone(log.created_at)

    def test_create_log_with_user(self):
        user = get_user_model().objects.create_user(email="user@example.com", password="secret123")

        log = SystemLog.objects.create(
            user=user,
            action="logout",
            message="User logged out",
            level=SystemLog.Level.WARNING,
        )

        self.assertEqual(log.user, user)
        self.assertEqual(log.level, SystemLog.Level.WARNING)

    def test_create_log_without_user(self):
        log = SystemLog.objects.create(action="refresh", message="Token refreshed", level=SystemLog.Level.ERROR)

        self.assertIsNone(log.user)
        self.assertEqual(log.level, SystemLog.Level.ERROR)

    def test_read_log_from_database(self):
        log = SystemLog.objects.create(action="view", message="Viewed dashboard", level=SystemLog.Level.INFO)

        saved_log = SystemLog.objects.get(pk=log.pk)

        self.assertEqual(saved_log.action, "view")
        self.assertEqual(saved_log.message, "Viewed dashboard")
        self.assertEqual(saved_log.level, SystemLog.Level.INFO)

    def test_logs_are_ordered_newest_first(self):
        first_log = SystemLog.objects.create(action="first", message="First log", level=SystemLog.Level.INFO)
        second_log = SystemLog.objects.create(action="second", message="Second log", level=SystemLog.Level.INFO)

        logs = list(SystemLog.objects.all())

        self.assertEqual(logs[0], second_log)
        self.assertEqual(logs[1], first_log)
