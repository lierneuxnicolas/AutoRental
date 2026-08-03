from __future__ import annotations

from rest_framework import serializers

from accounts.models import User
from interventions.models import Intervention
from reservations.models import Reservation
from vehicles.models import Vehicle


class InterventionManagementCreateSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(required=True)
    reservation_id = serializers.IntegerField(required=False, allow_null=True)
    type = serializers.ChoiceField(choices=Intervention.Type.choices, required=True, source="intervention_type")
    description = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_vehicle_id(self, value):
        if not Vehicle.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Le vehicule demande est introuvable.")
        return value

    def validate_reservation_id(self, value):
        if value is None:
            return value
        if not Reservation.objects.filter(pk=value).exists():
            raise serializers.ValidationError("La reservation demandee est introuvable.")
        return value


class InterventionManagementAssignSerializer(serializers.Serializer):
    assigned_user_id = serializers.IntegerField(required=True)

    def validate_assigned_user_id(self, value):
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("L'utilisateur assigne est introuvable.")
        return value


class InterventionAssigneeSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(source="role.code", read_only=True)


class InterventionVehicleSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    registration_number = serializers.CharField(read_only=True)
    brand = serializers.CharField(source="brand.name", read_only=True)
    model_name = serializers.CharField(read_only=True)


class InterventionReservationSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    reference = serializers.CharField(read_only=True)


class InterventionManagementResponseSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="intervention_type", read_only=True)
    vehicle = InterventionVehicleSummarySerializer(read_only=True)
    reservation = InterventionReservationSummarySerializer(read_only=True, allow_null=True)
    assigned_to = InterventionAssigneeSummarySerializer(read_only=True, allow_null=True)
    created_by = InterventionAssigneeSummarySerializer(read_only=True)

    class Meta:
        model = Intervention
        fields = [
            "id",
            "reference",
            "type",
            "intervention_type",
            "status",
            "description",
            "vehicle",
            "reservation",
            "assigned_to",
            "created_by",
            "created_at",
            "updated_at",
        ]


class InterventionWorkerPhotoCreateSerializer(serializers.Serializer):
    file = serializers.ImageField(required=True)
    caption = serializers.CharField(required=False, allow_blank=True, default="")


class InterventionWorkerPhotoResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    file = serializers.ImageField(read_only=True)
    caption = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class InterventionWorkerCompleteSerializer(serializers.Serializer):
    report = serializers.CharField(required=False, allow_blank=True, default="")
