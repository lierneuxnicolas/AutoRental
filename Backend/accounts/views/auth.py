from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView as SimpleJWTTokenRefreshView

from accounts.serializers.auth import (
    CurrentUserSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    VerifyEmailSerializer,
)
from accounts.models import User
from accounts.services.email_verification import (
    AlreadyUsedEmailVerificationToken,
    ExpiredEmailVerificationToken,
    InvalidEmailVerificationToken,
    verify_email_verification_token,
)
from accounts.services.registration import RegistrationError, register_client_user
from django.contrib.auth.tokens import default_token_generator
from common.models import SystemLog
from common.services import create_system_log
from notifications.services import create_notification


MessageResponseSerializer = inline_serializer(
    name="MessageResponse",
    fields={"message": drf_serializers.CharField()},
)

ErrorDetailResponseSerializer = inline_serializer(
    name="ErrorDetailResponse",
    fields={"detail": drf_serializers.CharField()},
)

AuthUserResponseSerializer = inline_serializer(
    name="AuthUserResponse",
    fields={
        "id": drf_serializers.IntegerField(),
        "email": drf_serializers.EmailField(),
        "first_name": drf_serializers.CharField(),
        "last_name": drf_serializers.CharField(),
        "role": drf_serializers.CharField(allow_null=True),
        "email_verified": drf_serializers.BooleanField(),
    },
)

RegisterResponseSerializer = inline_serializer(
    name="RegisterResponse",
    fields={
        "message": drf_serializers.CharField(),
        "user": AuthUserResponseSerializer,
    },
)

LoginResponseSerializer = inline_serializer(
    name="LoginResponse",
    fields={
        "access": drf_serializers.CharField(),
        "refresh": drf_serializers.CharField(),
        "user": AuthUserResponseSerializer,
    },
)

TokenRefreshRequestSerializer = inline_serializer(
    name="TokenRefreshRequest",
    fields={"refresh": drf_serializers.CharField()},
)

TokenRefreshResponseSerializer = inline_serializer(
    name="TokenRefreshResponse",
    fields={"access": drf_serializers.CharField()},
)


def _extract_request_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.META.get("REMOTE_ADDR")


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Authentication"],
        auth=[],
        request=RegisterSerializer,
        responses={
            201: RegisterResponseSerializer,
            400: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = register_client_user(**serializer.validated_data)
        except RegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Compte cree. Consultez votre e-mail pour confirmer votre adresse.",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": user.role.code if user.role else None,
                    "email_verified": user.email_verified,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Authentication"],
        responses={
            200: CurrentUserSerializer,
            401: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Authentication"],
        auth=[],
        request=VerifyEmailSerializer,
        responses={
            200: MessageResponseSerializer,
            400: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["token"]

        try:
            verify_email_verification_token(token)
        except ExpiredEmailVerificationToken as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except AlreadyUsedEmailVerificationToken as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except InvalidEmailVerificationToken as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": "Adresse e-mail confirmee."}, status=status.HTTP_200_OK)


@extend_schema_view(
    post=extend_schema(
        tags=["Authentication"],
        auth=[],
        request=LoginSerializer,
        responses={
            200: LoginResponseSerializer,
            401: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
)
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


@extend_schema_view(
    post=extend_schema(
        tags=["Authentication"],
        auth=[],
        request=TokenRefreshRequestSerializer,
        responses={
            200: TokenRefreshResponseSerializer,
            401: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
)
class TokenRefreshView(SimpleJWTTokenRefreshView):
    permission_classes = [AllowAny]


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Authentication"],
        request=LogoutSerializer,
        responses={
            205: MessageResponseSerializer,
            400: OpenApiResponse(response=ErrorDetailResponseSerializer),
            401: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        refresh_token = serializer.validated_data["refresh"]

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response({"detail": "Refresh token invalide."}, status=status.HTTP_400_BAD_REQUEST)

        create_system_log(
            user=request.user,
            action="LOGOUT",
            message="Utilisateur déconnecté avec succès.",
            level=SystemLog.Level.INFO,
            ip_address=_extract_request_ip(request),
        )

        return Response({"message": "Deconnexion reussie."}, status=status.HTTP_205_RESET_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Authentication"],
        auth=[],
        request=PasswordResetRequestSerializer,
        responses={200: MessageResponseSerializer},
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user is not None:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            frontend_url = getattr(settings, "FRONTEND_URL", "") or ""
            reset_url = f"{frontend_url.rstrip('/')}/reset-password?uid={uidb64}&token={token}"

            def _send_reset_email():
                send_mail(
                    subject="Reinitialisez votre mot de passe GetACar",
                    message=(
                        "Bonjour,\n\n"
                        "Vous avez demande la reinitialisation de votre mot de passe GetACar.\n\n"
                        "Pour choisir un nouveau mot de passe, ouvrez le lien suivant :\n\n"
                        f"{reset_url}\n\n"
                        "Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet e-mail.\n\n"
                        "Ce lien est valable pendant la duree configuree par Django.\n\n"
                        "GetACar"
                    ),
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                    recipient_list=[user.email],
                    fail_silently=False,
                )

            transaction.on_commit(_send_reset_email)

        return Response(
            {"message": "Si un compte correspond a cette adresse, un e-mail a ete envoye."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Authentication"],
        auth=[],
        request=PasswordResetConfirmSerializer,
        responses={
            200: MessageResponseSerializer,
            400: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        new_password = serializer.validated_data["new_password"]

        user.set_password(new_password)
        user.save(update_fields=["password"])

        create_notification(
            user=user,
            notification_type="PASSWORD_CHANGED",
            title="Mot de passe modifie",
            message="Le mot de passe de votre compte AutoRental a ete reinitialise.",
        )

        return Response({"message": "Mot de passe reinitialise."}, status=status.HTTP_200_OK)
