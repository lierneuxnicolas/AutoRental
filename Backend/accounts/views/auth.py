from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers.auth import CurrentUserSerializer, RegisterSerializer, VerifyEmailSerializer
from accounts.services.email_verification import (
    AlreadyUsedEmailVerificationToken,
    ExpiredEmailVerificationToken,
    InvalidEmailVerificationToken,
    verify_email_verification_token,
)
from accounts.services.registration import RegistrationError, register_client_user


class RegisterView(APIView):
    permission_classes = [AllowAny]

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

    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

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
