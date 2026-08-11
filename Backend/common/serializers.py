from django.contrib.auth import get_user_model
from rest_framework import serializers

from common.models import SystemLog


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
