from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import caches
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APITestCase
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.models import Role
from accounts.serializers.jwt import SingleUseRefreshToken

from .utils import ensure_roles


class JwtRevocationTests(APITestCase):
    password = "OriginalPassword123!"
    new_password = "ChangedPassword456!"

    def setUp(self):
        caches["auth_rate_limit"].clear()
        self.addCleanup(caches["auth_rate_limit"].clear)
        self.role = ensure_roles()[Role.Code.CLIENT]
        self.user = self.create_user("client@example.com")

    def create_user(self, email):
        return get_user_model().objects.create_user(
            email=email,
            password=self.password,
            first_name="Test",
            last_name="Client",
            phone="0102030405",
            role=self.role,
            email_verified=True,
        )

    def login(self, password=None):
        response = self.client.post(
            reverse("accounts:auth-login"),
            {"email": self.user.email, "password": password or self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response.data

    def refresh(self, token):
        return self.client.post(
            reverse("accounts:auth-token-refresh"), {"refresh": token}, format="json"
        )

    def me(self, access):
        return self.client.get(reverse("accounts:auth-me"), HTTP_AUTHORIZATION=f"Bearer {access}")

    def logout(self, access, refresh):
        return self.client.post(
            reverse("accounts:auth-logout"),
            {"refresh": refresh},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )

    def test_reset_rejects_old_tokens_and_accepts_new_password(self):
        tokens = self.login()
        self.assertEqual(self.me(tokens["access"]).status_code, 200)
        rotated = self.refresh(tokens["refresh"])
        self.assertEqual(rotated.status_code, 200)
        self.assertEqual(self.me(rotated.data["access"]).status_code, 200)

        response = self.client.post(
            reverse("accounts:auth-password-reset-confirm"),
            {
                "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
                "token": default_token_generator.make_token(self.user),
                "new_password": self.new_password,
                "new_password_confirm": self.new_password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        for access in (tokens["access"], rotated.data["access"]):
            self.assertEqual(self.me(access).status_code, 401)
        self.assertEqual(self.refresh(rotated.data["refresh"]).status_code, 401)
        current = self.login(self.new_password)
        self.assertEqual(self.me(current["access"]).status_code, 200)
        self.assertEqual(self.refresh(current["refresh"]).status_code, 200)

    def test_direct_password_change_revokes_tokens(self):
        tokens = self.login()
        self.user.set_password(self.new_password)
        self.user.save(update_fields=["password"])
        self.assertEqual(self.me(tokens["access"]).status_code, 401)
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 401)

    def test_legacy_tokens_without_password_claim_are_refused(self):
        legacy = RefreshToken.for_user(self.user)
        del legacy[api_settings.REVOKE_TOKEN_CLAIM]
        self.assertEqual(self.me(str(legacy.access_token)).status_code, 401)
        self.assertEqual(self.refresh(str(legacy)).status_code, 401)

    def test_rotation_blacklists_the_prior_token_and_preserves_lifetimes(self):
        tokens = self.login()
        old_jti = RefreshToken(tokens["refresh"])[api_settings.JTI_CLAIM]
        response = self.refresh(tokens["refresh"])
        self.assertEqual(response.status_code, 200)
        replacement = RefreshToken(response.data["refresh"])
        access = AccessToken(response.data["access"])
        self.assertFalse(replacement[api_settings.JTI_CLAIM] == old_jti)
        self.assertEqual(replacement["exp"] - replacement["iat"], 86400)
        self.assertEqual(access["exp"] - access["iat"], 300)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=old_jti).exists())
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 401)
        self.assertEqual(self.refresh(response.data["refresh"]).status_code, 200)

    def test_rotation_rejects_a_refresh_validated_before_a_concurrent_revocation(self):
        tokens = self.login()
        in_flight = SingleUseRefreshToken(tokens["refresh"])
        RefreshToken(tokens["refresh"]).blacklist()
        with self.assertRaises(TokenError):
            in_flight.blacklist()

    def test_logout_revokes_rotated_refresh_but_access_expires_normally(self):
        tokens = self.login()
        rotated = self.refresh(tokens["refresh"])
        self.assertEqual(rotated.status_code, 200)
        self.assertEqual(self.logout(rotated.data["access"], rotated.data["refresh"]).status_code, 205)
        self.assertEqual(self.refresh(rotated.data["refresh"]).status_code, 401)
        self.assertEqual(self.me(rotated.data["access"]).status_code, 200)

    def test_logout_cannot_revoke_another_users_refresh(self):
        tokens = self.login()
        other = self.create_user("other@example.com")
        other_refresh = str(RefreshToken.for_user(other))
        self.assertEqual(self.logout(tokens["access"], other_refresh).status_code, 400)
        self.assertEqual(self.refresh(other_refresh).status_code, 200)


    def test_expired_access_can_only_prove_ownership_to_logout(self):
        tokens = self.login()
        expired = AccessToken(tokens["access"])
        expired.set_exp(lifetime=timedelta(seconds=-1))
        expired_bearer = str(expired)

        self.assertEqual(self.me(expired_bearer).status_code, 401)
        self.assertEqual(self.logout(expired_bearer, tokens["refresh"]).status_code, 205)
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 401)
        self.assertEqual(self.logout(expired_bearer, tokens["refresh"]).status_code, 400)

    def test_expired_access_cannot_revoke_foreign_refresh(self):
        tokens = self.login()
        expired = AccessToken(tokens["access"])
        expired.set_exp(lifetime=timedelta(seconds=-1))
        foreign = str(RefreshToken.for_user(self.create_user("foreign@example.com")))

        self.assertEqual(self.logout(str(expired), foreign).status_code, 400)
        self.assertEqual(self.refresh(foreign).status_code, 200)
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 200)

    def test_logout_rejects_wrong_token_type_and_invalid_signature(self):
        tokens = self.login()
        access = tokens["access"]
        header, payload, signature = access.split(".")
        bad_signature = ("A" if signature[0] != "A" else "B") + signature[1:]
        forged = f"{header}.{payload}.{bad_signature}"

        self.assertEqual(self.logout(forged, tokens["refresh"]).status_code, 401)
        self.assertEqual(self.logout(tokens["refresh"], tokens["refresh"]).status_code, 401)
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 200)
