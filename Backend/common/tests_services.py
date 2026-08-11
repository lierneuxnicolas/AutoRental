from django.contrib.auth import get_user_model
from django.test import TestCase

from common.models import SystemLog
from common.services import create_system_log


class CreateSystemLogServiceTests(TestCase):
    def test_create_system_log_with_default_level(self):
        log = create_system_log(action="signin", message="User signed in")

        self.assertEqual(log.level, SystemLog.Level.INFO)
        self.assertEqual(log.action, "signin")
        self.assertEqual(log.message, "User signed in")
        self.assertIsNone(log.user)
        self.assertIsNotNone(log.pk)

    def test_create_system_log_with_user_and_ip(self):
        user = get_user_model().objects.create_user(email="service@example.com", password="secret123")

        log = create_system_log(
            user=user,
            action="signout",
            message="User signed out",
            level=SystemLog.Level.WARNING,
            ip_address="203.0.113.10",
        )

        self.assertEqual(log.user, user)
        self.assertEqual(log.level, SystemLog.Level.WARNING)
        self.assertEqual(log.ip_address, "203.0.113.10")
        self.assertIsNotNone(log.pk)

    def test_create_system_log_returns_created_system_log_instance(self):
        log = create_system_log(action="vehicle_update", message="Vehicle data updated")

        self.assertIsInstance(log, SystemLog)
        self.assertTrue(SystemLog.objects.filter(pk=log.pk).exists())

    def test_create_system_log_without_user_creates_log(self):
        log = create_system_log(action="healthcheck", message="Background health check executed")

        self.assertIsNone(log.user)
        self.assertTrue(SystemLog.objects.filter(pk=log.pk, user__isnull=True).exists())

    def test_create_system_log_persists_level_action_and_message(self):
        log = create_system_log(
            action="payment_failure",
            message="Payment provider returned a temporary error",
            level=SystemLog.Level.ERROR,
        )

        created_log = SystemLog.objects.get(pk=log.pk)
        self.assertEqual(created_log.level, SystemLog.Level.ERROR)
        self.assertEqual(created_log.action, "payment_failure")
        self.assertEqual(created_log.message, "Payment provider returned a temporary error")

    def test_create_system_log_persists_ip_address_when_provided(self):
        log = create_system_log(
            action="profile_view",
            message="Client profile viewed",
            ip_address="198.51.100.24",
        )

        self.assertEqual(log.ip_address, "198.51.100.24")
        self.assertTrue(SystemLog.objects.filter(pk=log.pk, ip_address="198.51.100.24").exists())
