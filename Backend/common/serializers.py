from django.contrib.auth import get_user_model
from rest_framework import serializers

from common.models import BackupRecord, SystemLog


class UserSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ("id", "email", "first_name", "last_name")
        read_only_fields = fields


class SystemLogSerializer(serializers.ModelSerializer):
    user = UserSimpleSerializer(read_only=True)

    class Meta:
        model = SystemLog
        fields = ("id", "user", "action", "message", "level", "ip_address", "created_at")
        read_only_fields = fields


class BackupRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupRecord
        fields = (
            "id",
            "filename",
            "backup_type",
            "status",
            "file_size",
            "created_at",
            "completed_at",
            "error_message",
        )
        read_only_fields = fields
