from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import (
    CommonPasswordValidator,
    validate_password,
)
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import caches
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command
from django.db import connections
from django.test import RequestFactory, override_settings, skipUnlessDBFeature
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient, APITestCase, APITransactionTestCase

from accounts.models import Role

from .utils import ensure_roles


def reset_payload(user, password):
    return {
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": default_token_generator.make_token(user),
        "new_password": password,
        "new_password_confirm": password,
    }


@override_settings(
    AUTH_RATE_LIMIT_REDIS_URL="",
    AUTH_RATE_LIMIT_REQUIRE_SHARED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class PasswordHardeningTests(APITestCase):
    legacy_password = "LegacyPass!"
    passphrase = "  lumière 🌟!@# voie lactée  "

    def setUp(self):
        caches["auth_rate_limit"].clear()
        self.addCleanup(caches["auth_rate_limit"].clear)
        self.roles = ensure_roles()

    def create_user(self, role=Role.Code.CLIENT, **kwargs):
        return get_user_model().objects.create_user(
            email=f"audit-{role.lower()}@example.com",
            password=self.legacy_password,
            first_name="Test",
            last_name="Account",
            phone="0102030405",
            role=self.roles[role],
            email_verified=True,
            **kwargs,
        )

    def test_unicode_code_point_lengths_and_controls(self):
        for length in (15, 128):
            validate_password("🌟" * length)
        for invalid in ("🌟" * 14, "🌟" * 129, "un mot avec saut\n de ligne", " " * 15):
            with self.assertRaises(ValidationError):
                validate_password(invalid)
        validate_password(self.passphrase)
        validate_password("qrvtmjkzlphsfwb")
        common = next(word for word in sorted(CommonPasswordValidator().passwords) if len(word) == 15)
        for invalid in ("123456789012345", common, "TestAccountExample"):
            user = get_user_model()(first_name="TestAccountExample")
            with self.assertRaises(ValidationError):
                validate_password(invalid, user=user)

    def test_registration_preserves_spaces_and_unicode(self):
        url = reverse("accounts:auth-register")
        payload = {
            "email": "new-audit@example.com",
            "first_name": "Test",
            "last_name": "Account",
            "phone": "0102030405",
            "password": self.passphrase,
            "password_confirm": self.passphrase[1:],
        }
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        payload["password_confirm"] = self.passphrase
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 201)
        user = get_user_model().objects.get(email=payload["email"])
        self.assertTrue(user.check_password(self.passphrase))
        self.assertFalse(user.check_password(self.passphrase[1:]))

    def test_existing_passwords_authenticate_for_all_five_roles(self):
        url = reverse("accounts:auth-login")
        self.assertEqual(len(Role.Code.values), 5)
        for role in Role.Code.values:
            with self.subTest(role=role):
                user = self.create_user(role)
                response = self.client.post(
                    url, {"email": user.email, "password": self.legacy_password}, format="json"
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["user"]["role"], role)

    def test_reset_preserves_spaces_and_accepts_only_exact_password(self):
        user = self.create_user()
        payload = reset_payload(user, self.passphrase)
        url = reverse("accounts:auth-password-reset-confirm")
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 200)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)
        login_url = reverse("accounts:auth-login")
        for password, expected in ((self.passphrase, 200), (self.passphrase[1:], 401)):
            response = self.client.post(
                login_url, {"email": user.email, "password": password}, format="json"
            )
            self.assertEqual(response.status_code, expected)

    def test_reset_link_expires_after_one_hour(self):
        user = self.create_user()
        now = default_token_generator._now()
        with patch.object(default_token_generator, "_now", return_value=now):
            payload = reset_payload(user, self.passphrase)
        with patch.object(default_token_generator, "_now", return_value=now + timedelta(hours=1, seconds=1)):
            response = self.client.post(reverse("accounts:auth-password-reset-confirm"), payload, format="json")
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password(self.legacy_password))

    def test_admin_creation_and_change_share_password_policy(self):
        staff = self.create_user(Role.Code.ADMINISTRATEUR, is_staff=True, is_superuser=True)
        model_admin = admin.site._registry[type(staff)]
        request = RequestFactory().get(reverse("admin:index"))
        request.user = staff
        add_form = model_admin.get_form(request)
        change_form = model_admin.change_password_form
        for password, valid in ((self.legacy_password, False), (self.passphrase, True)):
            data = {"password1": password, "password2": password, "usable_password": "true"}
            form = add_form(
                {**data, "email": "new-staff@example.com", "first_name": "Test",
                 "last_name": "Admin", "phone": "0102030406", "role": staff.role_id}
            )
            self.assertEqual(form.is_valid(), valid, tuple(form.errors))
            form = change_form(staff, data)
            self.assertEqual(form.is_valid(), valid, tuple(form.errors))

    def test_admin_login_quota_and_role(self):
        admin_user = self.create_user(Role.Code.ADMINISTRATEUR, is_staff=True)
        client_user = self.create_user()
        url = reverse("admin:login")
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.post(
            url, {"username": client_user.email, "password": self.legacy_password}
        ).status_code, 200)
        with (
            patch("accounts.throttling.time", return_value=120),
            override_settings(AUTH_RATE_LIMITS={"admin_login": (4, 60, 2, 60)}),
        ):
            for index in range(3):
                response = self.client.post(
                    url, {"username": admin_user.email, "password": "incorrect"},
                    REMOTE_ADDR=f"192.0.2.{index + 1}",
                )
                self.assertEqual(response.status_code, 429 if index == 2 else 200)
            self.assertEqual(response["Retry-After"], "60")
        response = self.client.post(
            url, {"username": admin_user.email, "password": self.legacy_password}
        )
        self.assertEqual(response.status_code, 302)

    @override_settings(ALLOW_DEMO_SEED=False)
    def test_demo_seed_refused_before_creating_accounts(self):
        count = get_user_model().objects.count()
        with self.assertRaises(CommandError):
            call_command("seed_demo")
        self.assertEqual(get_user_model().objects.count(), count)


@override_settings(AUTH_RATE_LIMIT_REDIS_URL="", AUTH_RATE_LIMIT_REQUIRE_SHARED=False)
class ConcurrentPasswordResetTests(APITransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_same_link_is_consumed_only_once_by_concurrent_requests(self):
        caches["auth_rate_limit"].clear()
        self.addCleanup(caches["auth_rate_limit"].clear)
        user = get_user_model().objects.create_user(
            email="concurrency@example.com", password="LegacyPass!", email_verified=True
        )
        url = reverse("accounts:auth-password-reset-confirm")
        passwords = ("first fresh phrase", "second fresh phrase")
        payloads = [reset_payload(user, password) for password in passwords]
        barrier = Barrier(2)

        def confirm(payload):
            try:
                barrier.wait(timeout=15)
                return APIClient().post(url, payload, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(confirm, payloads))
        self.assertCountEqual(statuses, (200, 400))
        user.refresh_from_db()
        self.assertTrue(user.check_password(passwords[statuses.index(200)]))

