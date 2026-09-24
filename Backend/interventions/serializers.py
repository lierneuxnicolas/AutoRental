from __future__ import annotations

import json

from rest_framework import serializers

from accounts.models import User
from interventions.models import Intervention, TechnicalInspection, TechnicalPhoto
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

class InterventionDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=Intervention.Decision.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    assigned_user_id = serializers.IntegerField(required=False, min_value=1)
    planned_start_at = serializers.DateTimeField(required=False)
    planned_end_at = serializers.DateTimeField(required=False)
    description = serializers.CharField(required=False, allow_blank=True, default="")


class InterventionManagementPlanSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(min_value=1)
    type = serializers.ChoiceField(choices=Intervention.Type.choices, source="intervention_type")
    assigned_user_id = serializers.IntegerField(min_value=1)
    planned_start_at = serializers.DateTimeField()
    planned_end_at = serializers.DateTimeField()
    description = serializers.CharField(allow_blank=False, trim_whitespace=True)

    def validate(self, attrs):
        if attrs["planned_start_at"].minute not in {0, 30}:
            raise serializers.ValidationError({"planned_start_at": "Veuillez choisir un horaire par tranche de 30 minutes."})
        if attrs["planned_end_at"] <= attrs["planned_start_at"]:
            raise serializers.ValidationError({"planned_end_at": "La fin prévue doit être postérieure au début prévu."})
        return attrs


class InterventionAssigneeSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(source="role.code", read_only=True)


class InterventionAssignableUserSerializer(serializers.Serializer):
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
    parking_name = serializers.CharField(source="parking_space.parking.name", read_only=True)
    parking_space_number = serializers.CharField(source="parking_space.number", read_only=True)


class InterventionReservationSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    reference = serializers.CharField(read_only=True)


class TechnicalPhotoSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = TechnicalPhoto
        fields = ["id", "file", "caption", "created_at"]


class TechnicalInspectionSummarySerializer(serializers.ModelSerializer):
    photos = TechnicalPhotoSummarySerializer(many=True, read_only=True)

    class Meta:
        model = TechnicalInspection
        fields = ["id", "phase", "mileage", "energy_level_percent", "observations", "created_at", "photos"]


class InterventionManagementResponseSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="intervention_type", read_only=True)
    vehicle = InterventionVehicleSummarySerializer(read_only=True)
    reservation = InterventionReservationSummarySerializer(read_only=True, allow_null=True)
    assigned_to = InterventionAssigneeSummarySerializer(read_only=True, allow_null=True)
    created_by = InterventionAssigneeSummarySerializer(read_only=True)
    check_in = serializers.SerializerMethodField()
    check_out = serializers.SerializerMethodField()
    work_data = serializers.SerializerMethodField()
    final_report = serializers.SerializerMethodField()

    class Meta:
        model = Intervention
        fields = [
            "id",
            "reference",
            "type",
            "intervention_type",
            "status",
            "description",
            "cancellation_reason",
            "cancelled_at",
            "vehicle",
            "reservation",
            "assigned_to",
            "created_by",
            "check_in",
            "check_out",
            "estimated_cost",
            "planned_start_at",
            "planned_end_at",
            "decision",
            "decided_at",
            "decided_by",
            "decision_comment",
            "work_data",
            "final_report",
            "created_at",
            "updated_at",
        ]

    def get_check_in(self, obj):
        technical_inspection = obj.technical_inspections.filter(phase=TechnicalInspection.Phase.INITIAL).order_by("id").first()
        if technical_inspection is None:
            technical_inspection = obj.technical_inspections.order_by("id").first()
        if technical_inspection is None:
            return None
        return TechnicalInspectionSummarySerializer(technical_inspection, context=self.context).data

    def get_check_out(self, obj):
        technical_inspection = obj.technical_inspections.filter(phase=TechnicalInspection.Phase.FINAL).order_by("id").first()
        if technical_inspection is None:
            return None
        return TechnicalInspectionSummarySerializer(technical_inspection, context=self.context).data

    def get_work_data(self, obj):
        if not obj.report:
            return None

        try:
            payload = json.loads(obj.report)
        except (TypeError, ValueError):
            return None

        if not isinstance(payload, dict):
            return None

        return payload.get("work_in_progress")

    def get_final_report(self, obj):
        if not obj.report:
            return None

        try:
            payload = json.loads(obj.report)
        except (TypeError, ValueError):
            return None

        if not isinstance(payload, dict):
            return None

        return payload.get("final_report")


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


class InterventionWorkerWorkSerializer(serializers.Serializer):
    work_data = serializers.JSONField(required=True)
    estimated_cost = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class InterventionWorkerCheckOutSerializer(serializers.Serializer):
    final_mileage = serializers.IntegerField(min_value=0, required=True)
    final_vehicle_state = serializers.CharField(required=True, allow_blank=False)
    conclusions = serializers.CharField(required=True, allow_blank=False)
    vehicle_operational = serializers.BooleanField(required=False, allow_null=True)
    vehicle_clean = serializers.BooleanField(required=False, allow_null=True)
    new_intervention_needed = serializers.BooleanField(required=True)
    final_comment = serializers.CharField(required=False, allow_blank=True, default="")


class InterventionWorkerCheckInSerializer(serializers.Serializer):
    mileage = serializers.IntegerField(min_value=0, required=True)
    observations = serializers.CharField(required=True, allow_blank=False)
    vehicle_condition = serializers.CharField(required=False, allow_blank=True, default="")
    cleanliness_state = serializers.CharField(required=False, allow_blank=True, default="")
    cleanliness_notes = serializers.CharField(required=False, allow_blank=True, default="")


class InterventionWorkerInterruptSerializer(serializers.Serializer):
    reason_type = serializers.ChoiceField(
        choices=[
            ("vehicule_accidente", "Vehicule accidente"),
            ("probleme_securite", "Probleme de securite"),
            ("vehicule_inaccessible", "Vehicule inaccessible"),
            ("vehicule_non_deplacable", "Vehicule non deplacable"),
            ("mauvais_vehicule", "Mauvais vehicule"),
            ("autre", "Autre"),
        ],
        required=True,
    )
    reason_detail = serializers.CharField(required=False, allow_blank=True, default="")
    photo = serializers.ImageField(required=False)
