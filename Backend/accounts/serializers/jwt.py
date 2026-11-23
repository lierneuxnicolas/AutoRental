from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken


class SingleUseRefreshToken(RefreshToken):
    def blacklist(self):
        entry, created = super().blacklist()
        if not created:
            # A concurrent refresh or logout may have revoked it after validation.
            raise TokenError("Token is blacklisted")
        return entry, created


class PasswordBoundTokenRefreshSerializer(TokenRefreshSerializer):
    token_class = SingleUseRefreshToken

    @transaction.atomic
    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        # Use the same lock as account closure, before checking the password fingerprint.
        get_user_model().objects.select_for_update().filter(
            **{api_settings.USER_ID_FIELD: refresh.get(api_settings.USER_ID_CLAIM)}
        ).exists()
        # Simple JWT checks the password fingerprint on access authentication.
        # Reuse that same check before allowing a refresh to issue any new token.
        JWTAuthentication().get_user(refresh)
        return super().validate(attrs)
