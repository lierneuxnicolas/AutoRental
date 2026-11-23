import jwt
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenBackendError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.tokens import AccessToken


class LogoutJWTAuthentication(JWTAuthentication):
    """Accept a signed expired access token as ownership proof only at logout."""

    def get_validated_token(self, raw_token):
        try:
            payload = jwt.decode(
                raw_token,
                token_backend.get_verifying_key(raw_token),
                algorithms=[token_backend.algorithm],
                audience=token_backend.audience,
                issuer=token_backend.issuer,
                leeway=token_backend.get_leeway(),
                options={
                    "verify_exp": False,
                    "verify_aud": token_backend.audience is not None,
                    "require": ["exp", api_settings.JTI_CLAIM, api_settings.USER_ID_CLAIM],
                },
            )
        except (jwt.PyJWTError, TokenBackendError) as exc:
            raise InvalidToken("Jeton d'accès invalide.") from exc

        if payload.get(api_settings.TOKEN_TYPE_CLAIM) != AccessToken.token_type:
            raise InvalidToken("Jeton d'accès invalide.")
        return payload
