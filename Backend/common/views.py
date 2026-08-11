from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from common.models import BackupRecord, SystemLog
from common.serializers import BackupRecordSerializer, SystemLogSerializer
from common.services import create_database_backup


class SystemLogListView(ListAPIView):
    permission_classes = [IsAdministrator]
    serializer_class = SystemLogSerializer
    queryset = SystemLog.objects.select_related("user").order_by("-created_at")
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {"level": ["exact"], "user": ["exact"]}
    search_fields = ["action", "message", "user__email"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]


class BackupRecordListView(ListAPIView):
    permission_classes = [IsAdministrator]
    serializer_class = BackupRecordSerializer
    queryset = BackupRecord.objects.all()
    ordering = ["-created_at"]


class BackupRecordCreateView(APIView):
    permission_classes = [IsAdministrator]

    def post(self, request):
        backup_record = create_database_backup()
        serializer = BackupRecordSerializer(backup_record)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BackupRecordDownloadView(APIView):
    permission_classes = [IsAdministrator]

    def get(self, request, pk: int):
        backup_record = BackupRecord.objects.filter(pk=pk).first()
        if backup_record is None:
            raise NotFound("Sauvegarde introuvable.")

        if backup_record.status != BackupRecord.Status.REUSSIE:
            raise NotFound("Cette sauvegarde n'est pas disponible en telechargement.")

        backup_root = (Path(settings.BASE_DIR) / "backups").resolve()
        backup_path = Path(backup_record.file_path).resolve()

        try:
            backup_path.relative_to(backup_root)
        except ValueError as exc:
            raise NotFound("Fichier de sauvegarde introuvable.") from exc

        if backup_path.name != backup_record.filename or backup_path.suffix.lower() != ".sql":
            raise NotFound("Fichier de sauvegarde introuvable.")

        if not backup_path.is_file():
            raise NotFound("Fichier de sauvegarde introuvable.")

        return FileResponse(
            backup_path.open("rb"),
            as_attachment=True,
            filename=backup_record.filename,
            content_type="application/sql",
        )
