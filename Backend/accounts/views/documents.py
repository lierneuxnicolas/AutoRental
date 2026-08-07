from drf_spectacular.utils import OpenApiResponse, extend_schema
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import generics
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ClientDocument, ClientProfile
from accounts.permissions import IsClient, IsManager
from accounts.serializers.documents import (
    ClientDocumentCreateSerializer,
    ClientDocumentReadSerializer,
    ManagerClientDocumentDetailSerializer,
    ManagerClientDocumentListSerializer,
    ManagerRejectDocumentSerializer,
)
from accounts.services.document_review import reject_document, validate_document


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
    parser_classes = [MultiPartParser, FormParser]
    queryset = ClientDocument.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
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
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "document_type": {"$ref": "#/components/schemas/DocumentTypeEnum"},
                    "document_number": {"type": "string", "maxLength": 120},
                    "file": {"type": "string", "format": "binary"},
                    "expiration_date": {"type": "string", "format": "date", "nullable": True},
                },
                "required": ["document_type", "document_number", "file"],
            }
        },
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
    queryset = ClientDocument.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
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


class ManagementClientDocumentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsManager]
    serializer_class = ManagerClientDocumentListSerializer

    def get_queryset(self):
        queryset = ClientDocument.objects.select_related(
            "client",
            "client__user",
            "validated_by",
        )

        document_type = self.request.query_params.get("document_type")
        status_param = self.request.query_params.get("status")
        is_active_param = self.request.query_params.get("is_active")
        search = self.request.query_params.get("search")

        if document_type:
            queryset = queryset.filter(document_type=document_type)

        if status_param:
            queryset = queryset.filter(status=status_param)

        if is_active_param is not None:
            normalized = str(is_active_param).strip().lower()
            if normalized in {"true", "1", "yes"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"false", "0", "no"}:
                queryset = queryset.filter(is_active=False)

        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(
                    Q(client__user__email__icontains=query)
                    | Q(client__user__first_name__icontains=query)
                    | Q(client__user__last_name__icontains=query)
                    | Q(document_number__icontains=query)
                )

        return queryset.order_by("-uploaded_at")

    @extend_schema(
        tags=["Document Management"],
        responses={
            200: ManagerClientDocumentListSerializer(many=True),
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ManagementClientDocumentDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsManager]
    serializer_class = ManagerClientDocumentDetailSerializer

    def get_queryset(self):
        return ClientDocument.objects.select_related("client", "client__user", "validated_by")

    @extend_schema(
        tags=["Document Management"],
        responses={
            200: ManagerClientDocumentDetailSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ManagementClientDocumentValidateView(APIView):
    permission_classes = [IsAuthenticated, IsManager]
    serializer_class = ManagerClientDocumentDetailSerializer

    @extend_schema(
        tags=["Document Management"],
        request=None,
        responses={
            200: ManagerClientDocumentDetailSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, pk):
        document = get_object_or_404(
            ClientDocument.objects.select_related("client", "client__user", "validated_by"),
            pk=pk,
        )

        try:
            validate_document(document=document, manager=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})

        serializer = ManagerClientDocumentDetailSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

class ManagementClientDocumentRejectView(APIView):
    permission_classes = [IsAuthenticated, IsManager]
    serializer_class = ManagerRejectDocumentSerializer

    @extend_schema(
        tags=["Document Management"],
        request=ManagerRejectDocumentSerializer,
        responses={
            200: ManagerClientDocumentDetailSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, pk):
        serializer = ManagerRejectDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document = get_object_or_404(
            ClientDocument.objects.select_related("client", "client__user", "validated_by"),
            pk=pk,
        )

        try:
            reject_document(
                document=document,
                manager=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})

        response_serializer = ManagerClientDocumentDetailSerializer(document)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
