from rest_framework import serializers

from accounts.models import User


class ManagerUserListSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
        )

    def get_role(self, obj) -> str | None:
        return obj.role.code if obj.role else None


class ManagerUserDetailSerializer(ManagerUserListSerializer):
    phone = serializers.CharField(read_only=True)
    date_of_birth = serializers.SerializerMethodField()

    class Meta(ManagerUserListSerializer.Meta):
        fields = ManagerUserListSerializer.Meta.fields + ("phone", "date_of_birth")

    def get_date_of_birth(self, obj) -> str | None:
        profile = getattr(obj, "client_profile", None)
        return profile.date_of_birth.isoformat() if profile and profile.date_of_birth else None


class ManagerUserStatusUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=True)
