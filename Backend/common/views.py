from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.generics import ListAPIView

from accounts.permissions import IsAdministrator
from common.models import SystemLog
from common.serializers import SystemLogSerializer


class SystemLogListView(ListAPIView):
    permission_classes = [IsAdministrator]
    serializer_class = SystemLogSerializer
    queryset = SystemLog.objects.select_related("user").order_by("-created_at")
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {"level": ["exact"], "user": ["exact"]}
    search_fields = ["action", "message", "user__email"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
