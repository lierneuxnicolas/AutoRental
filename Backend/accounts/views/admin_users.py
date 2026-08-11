from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdministrator
from accounts.serializers.admin_users import AdminUserListSerializer, AdminUserStatusUpdateSerializer
from common.models import SystemLog
from common.services import create_system_log


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class AdminUserFilterSet(filters.FilterSet):
    role = filters.CharFilter(field_name="role__code", lookup_expr="exact")
    is_active = filters.BooleanFilter(field_name="is_active")
    email_verified = filters.BooleanFilter(field_name="email_verified")

    class Meta:
        model = User
        fields = ["role", "is_active", "email_verified"]


class AdminUserListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    serializer_class = AdminUserListSerializer
    filterset_class = AdminUserFilterSet
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["date_joined", "email", "last_login"]
    ordering = ["-date_joined"]
    queryset = User.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset

        return User.objects.select_related("role").order_by(*self.ordering)

    @extend_schema(
        tags=["Admin Users"],
        responses={
            200: AdminUserListSerializer(many=True),
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class AdminUserStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    @staticmethod
    def _extract_request_ip(request) -> str | None:
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        return request.META.get("REMOTE_ADDR")

    @extend_schema(
        tags=["Admin Users"],
        request=AdminUserStatusUpdateSerializer,
        responses={
            200: AdminUserListSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def patch(self, request, pk):
        serializer = AdminUserStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_object_or_404(User.objects.select_related("role"), pk=pk)

        new_is_active = serializer.validated_data["is_active"]
        if user.id == request.user.id and new_is_active is False:
            return Response(
                {"detail": "Vous ne pouvez pas désactiver votre propre compte."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_active != new_is_active:
            user.is_active = new_is_active
            user.save(update_fields=["is_active"])

            if new_is_active:
                action = "USER_ACTIVATED"
                level = SystemLog.Level.INFO
            else:
                action = "USER_DEACTIVATED"
                level = SystemLog.Level.WARNING

            create_system_log(
                user=request.user,
                action=action,
                message=f"User status changed for {user.email}.",
                level=level,
                ip_address=self._extract_request_ip(request),
            )

        response_serializer = AdminUserListSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
