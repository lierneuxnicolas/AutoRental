from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role, User
from accounts.permissions import IsManager, IsManagerOrAdministrator
from accounts.serializers.manager_users import (
    ManagerUserDetailSerializer,
    ManagerUserListSerializer,
    ManagerUserStatusUpdateSerializer,
)
from common.models import SystemLog
from common.services import create_system_log


class ManagerUserListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
    serializer_class = ManagerUserListSerializer
    ordering_fields = ["date_joined", "email"]
    ordering = ["-date_joined"]
    queryset = User.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
        return User.objects.select_related("role").order_by(*self.ordering)


class ManagerUserDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsManager]
    serializer_class = ManagerUserDetailSerializer
    queryset = User.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
        return User.objects.select_related("role", "client_profile")


class ManagerUserStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    @staticmethod
    def _extract_request_ip(request) -> str | None:
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")

    @transaction.atomic
    def patch(self, request, pk):
        serializer = ManagerUserStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_object_or_404(User.objects.select_for_update(), pk=pk)

        if user.id == request.user.id:
            return Response(
                {"detail": "Vous ne pouvez pas modifier le statut de votre propre compte."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_roles = {
            Role.Code.CLIENT,
            Role.Code.MECANICIEN,
            Role.Code.NETTOYEUR,
        }
        role_code = user.role.code if user.role else None
        if role_code not in allowed_roles or user.is_superuser or user.is_staff:
            return Response(
                {"detail": "Vous n’êtes pas autorisé à modifier le statut de ce compte."},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_is_active = serializer.validated_data["is_active"]
        if new_is_active and user.account_closed_at is not None:
            return Response(
                {"detail": "Un compte clôturé sur demande ne peut pas être réactivé."},
                status=status.HTTP_409_CONFLICT,
            )
        if user.is_active != new_is_active:
            user.is_active = new_is_active
            user.save(update_fields=["is_active"])
            create_system_log(
                user=request.user,
                action="USER_ACTIVATED" if new_is_active else "USER_DEACTIVATED",
                message=f"User status changed for {user.email}.",
                level=SystemLog.Level.INFO if new_is_active else SystemLog.Level.WARNING,
                ip_address=self._extract_request_ip(request),
            )

        return Response(ManagerUserListSerializer(user).data, status=status.HTTP_200_OK)
