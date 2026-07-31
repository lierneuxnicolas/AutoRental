from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ClientProfile
from accounts.permissions import IsClient
from accounts.serializers.profile import ClientProfileMeSerializer


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class ClientProfileMeView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    def _get_client_profile(self, user):
        profile = getattr(user, "client_profile", None)
        if profile is not None:
            return profile
        profile, _ = ClientProfile.objects.get_or_create(
            user=user,
            defaults={"profile_status": ClientProfile.ProfileStatus.INCOMPLET},
        )
        return profile

    @extend_schema(
        tags=["Profile"],
        responses={
            200: ClientProfileMeSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request):
        profile = self._get_client_profile(request.user)
        serializer = ClientProfileMeSerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Profile"],
        request=ClientProfileMeSerializer,
        responses={
            200: ClientProfileMeSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def patch(self, request):
        profile = self._get_client_profile(request.user)
        serializer = ClientProfileMeSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)