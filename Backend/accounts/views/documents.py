from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from accounts.models import ClientDocument, ClientProfile
from accounts.permissions import IsClient
from accounts.serializers.documents import ClientDocumentCreateSerializer, ClientDocumentReadSerializer


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class _ClientProfileMixin:
    def _get_client_profile(self):
        user = self.request.user
        profile = getattr(user, "client_profile", None)
        if profile is not None:
            return profile
        profile, _ = ClientProfile.objects.get_or_create(
            user=user,
            defaults={"profile_status": ClientProfile.ProfileStatus.INCOMPLET},
        )
        return profile


class ClientDocumentListCreateView(_ClientProfileMixin, generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsClient]

    def get_queryset(self):
        return ClientDocument.objects.filter(client__user=self.request.user).select_related("client", "client__user")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ClientDocumentCreateSerializer
        return ClientDocumentReadSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["client_profile"] = self._get_client_profile()
        return context

    @extend_schema(
        tags=["Client Documents"],
        responses={
            200: ClientDocumentReadSerializer(many=True),
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        tags=["Client Documents"],
        request=ClientDocumentCreateSerializer,
        responses={
            201: ClientDocumentReadSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class ClientDocumentDetailView(generics.RetrieveAPIView):
    serializer_class = ClientDocumentReadSerializer
    permission_classes = [IsAuthenticated, IsClient]

    def get_queryset(self):
        return ClientDocument.objects.filter(client__user=self.request.user).select_related("client", "client__user")

    @extend_schema(
        tags=["Client Documents"],
        responses={
            200: ClientDocumentReadSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)