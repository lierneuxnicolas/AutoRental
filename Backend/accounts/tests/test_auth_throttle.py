from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import caches
from django.test import override_settings
from django.urls import reverse
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework.test import APITestCase

from accounts.models import Role

from .utils import ensure_roles


@override_settings(
    AUTH_RATE_LIMIT_REDIS_URL="",
    AUTH_RATE_LIMIT_REQUIRE_SHARED=False,
    AUTH_RATE_LIMIT_TRUSTED_PROXIES=(),
    AUTH_RATE_LIMITS={
        "login": (4, 60, 2, 60),
        "refresh": (2, 60, 0, 0),
        "reset_request": (3, 60, 2, 60),
    },
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class AuthThrottleTests(APITestCase):
    def setUp(self):
        caches["auth_rate_limit"].clear()
        self.addCleanup(caches["auth_rate_limit"].clear)
        clock = patch("accounts.throttling.time", return_value=120)
        clock.start()
        self.addCleanup(clock.stop)
        self.password = "TestPassword123!"
        roles = ensure_roles()
        self.user = get_user_model().objects.create_user(
            email="manager@example.com",
            password=self.password,
            first_name="Test",
            last_name="Manager",
            phone="0102030405",
            role=roles[Role.Code.GESTIONNAIRE_COMPTABLE],
            email_verified=True,
        )

    def post(self, endpoint, payload, ip="192.0.2.10", **headers):
        return self.client.post(
            reverse("accounts:" + endpoint), payload, format="json", REMOTE_ADDR=ip, **headers
        )

    def test_login_and_refresh_preserve_manager_identity(self):
        login = self.post("auth-login", {"email": self.user.email, "password": self.password})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["user"]["role"], self.user.role.code)
        refresh = login.data["refresh"]
        for _ in range(2):
            refreshed = self.post("auth-token-refresh", {"refresh": refresh})
            self.assertEqual(refreshed.status_code, 200)
            refresh = refreshed.data["refresh"]
        blocked = self.post("auth-token-refresh", {"refresh": refresh})
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked["Retry-After"], "60")

    def test_account_quota_applies_across_ips_and_email_case(self):
        for index, email in enumerate((self.user.email, self.user.email.upper(), self.user.email)):
            response = self.post(
                "auth-login", {"email": email, "password": "incorrect"}, ip=f"192.0.2.{index + 1}"
            )
            self.assertEqual(response.status_code, 429 if index == 2 else 401)

    def test_ip_quota_ignores_client_forwarding_header(self):
        for index in range(5):
            response = self.post(
                "auth-login",
                {"email": f"unknown{index}@example.com", "password": "incorrect"},
                HTTP_X_FORWARDED_FOR=f"203.0.113.{index + 1}",
            )
            self.assertEqual(response.status_code, 429 if index == 4 else 401)
        with patch("accounts.throttling.time", return_value=180):
            response = self.post("auth-login", {"email": self.user.email, "password": self.password})
        self.assertEqual(response.status_code, 200)

    @override_settings(AUTH_RATE_LIMIT_TRUSTED_PROXIES=("10.10.0.0/24",))
    def test_trusted_proxy_uses_nearest_untrusted_hop(self):
        for index in range(5):
            response = self.post(
                "auth-login",
                {"email": f"unknown{index}@example.com", "password": "incorrect"},
                ip="10.10.0.2",
                HTTP_X_FORWARDED_FOR=f"203.0.113.{index + 1}, 192.0.2.40, 10.10.0.3",
            )
            self.assertEqual(response.status_code, 429 if index == 4 else 401)

    def test_reset_limits_known_and_unknown_emails_identically(self):
        observed = []
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            for email in (self.user.email, "unknown@example.com"):
                responses = [
                    self.post("auth-password-reset", {"email": email}, ip=f"192.0.2.{index + 1}")
                    for index in range(3)
                ]
                self.assertEqual([response.status_code for response in responses], [200, 200, 429])
                observed.append([dict(response.data) for response in responses])
        self.assertEqual(observed[0], observed[1])
        self.assertEqual(len(callbacks), 2)

    @override_settings(AUTH_RATE_LIMIT_REQUIRE_SHARED=True)
    def test_missing_shared_store_disables_login(self):
        response = self.post("auth-login", {"email": self.user.email, "password": self.password})
        self.assertEqual(response.status_code, 503)

    @override_settings(AUTH_RATE_LIMIT_REDIS_URL="redis://localhost")
    @patch("accounts.throttling._redis_client")
    def test_unavailable_redis_disables_login(self, client):
        client.return_value.eval.side_effect = RedisConnectionError("Test unavailable")
        response = self.post("auth-login", {"email": self.user.email, "password": self.password})
        self.assertEqual(response.status_code, 503)


    def test_reset_ip_quota_applies_to_distinct_addresses(self):
        for index in range(4):
            response = self.post("auth-password-reset", {"email": f"unknown{index}@example.com"})
            self.assertEqual(response.status_code, 429 if index == 3 else 200)
        self.assertEqual(response["Retry-After"], "60")
