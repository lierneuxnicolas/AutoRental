from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User


class AdminUserStatusUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=True)


class AdminUserListSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "email_verified",
            "is_active",
            "date_joined",
            "last_login",
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_role(self, obj) -> str | None:
        if obj.role is None:
            return None
        return obj.role.code
