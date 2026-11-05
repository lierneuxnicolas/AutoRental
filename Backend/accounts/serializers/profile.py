from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from accounts.models import ClientProfile
from accounts.services.profile_status import (
    get_effective_profile_status,
    recalculate_profile_status,
)
from accounts.validators import validate_person_name, validate_phone_number


class ClientProfileMeSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False)
    phone = serializers.CharField(source="user.phone", required=False, allow_blank=True, max_length=30)
    email_verified = serializers.BooleanField(source="user.email_verified", read_only=True)
    role = serializers.SerializerMethodField(read_only=True)
    profile_status = serializers.SerializerMethodField(read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)

    class Meta:
        model = ClientProfile
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "email_verified",
            "role",
            "date_joined",
            "date_of_birth",
            "address",
            "profile_status",
            "rejection_reason",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "email",
            "email_verified",
            "role",
            "date_joined",
            "profile_status",
            "rejection_reason",
            "created_at",
            "updated_at",
        )

    def get_role(self, obj) -> str | None:
        if obj.user.role is None:
            return None
        return obj.user.role.code

    def get_profile_status(self, obj) -> str:
        return get_effective_profile_status(obj)

    def validate_first_name(self, value):
        return validate_person_name(value, label="prénom")

    def validate_last_name(self, value):
        return validate_person_name(value, label="nom")

    def validate_phone(self, value):
        return validate_phone_number(value)

    def validate_address(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("L'adresse ne peut pas etre vide.")
        return cleaned

    def validate_date_of_birth(self, value):
        try:
            ClientProfile.validate_date_of_birth_value(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0])
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user

        with transaction.atomic():
            user_changed_fields = []
            for field in ("first_name", "last_name", "phone"):
                if field in user_data:
                    setattr(user, field, user_data[field])
                    user_changed_fields.append(field)

            if user_changed_fields:
                user.full_clean()
                user.save(update_fields=user_changed_fields)

            profile_changed_fields = []
            for field in ("date_of_birth", "address"):
                if field in validated_data:
                    setattr(instance, field, validated_data[field])
                    profile_changed_fields.append(field)

            if profile_changed_fields:
                instance.full_clean()
                profile_changed_fields.append("updated_at")
                instance.save(update_fields=profile_changed_fields)

        recalculate_profile_status(instance)
        return instance


class ClientProfileProgressSerializer(serializers.Serializer):
    percentage = serializers.IntegerField(min_value=0, max_value=100)
    account_created = serializers.BooleanField()
    email_verified = serializers.BooleanField()
    personal_information_complete = serializers.BooleanField()
    identity_card_valid = serializers.BooleanField()
    driving_license_valid = serializers.BooleanField()
    identity_card_issue = serializers.CharField(allow_null=True)
    driving_license_issue = serializers.CharField(allow_null=True)
    profile_status = serializers.ChoiceField(choices=ClientProfile.ProfileStatus.choices)
    needs_client_action = serializers.BooleanField()
    documents_need_action = serializers.BooleanField()