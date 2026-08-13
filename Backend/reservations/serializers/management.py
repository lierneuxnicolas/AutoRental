"""
Serializers pour le management des réservations (point 39F).

Accessibles uniquement par:
- IsManagerOrAdministrator (gestionnaire-comptable, administrateur)

Données volontairement masquées pour la sécurité:
- Aucun mot de passe
- Aucun numéro complet de document d'identité
- Aucun fichier de document
- Aucune donnée bancaire
"""

from rest_framework import serializers

from accounts.models import ClientProfile
from inspections.models import Inspection
from inspections.serializers import InspectionDamageReadSerializer, InspectionPhotoReadSerializer
from interventions.models import Intervention
from interventions.serializers import InterventionManagementResponseSerializer
from reservations.models import Reservation
from vehicles.models import Vehicle


# ==============================================================================
# Client résumé pour le management (données limitées)
# ==============================================================================


class ReservationManagementClientSummarySerializer(serializers.Serializer):
    """Client résumé pour le management - données limitées."""

    id = serializers.IntegerField(source="client.id", read_only=True)
    first_name = serializers.CharField(source="client.user.first_name", read_only=True)
    last_name = serializers.CharField(source="client.user.last_name", read_only=True)
    email = serializers.EmailField(source="client.user.email", read_only=True)
    phone = serializers.CharField(source="client.user.phone", read_only=True, allow_blank=True)
    profile_status = serializers.CharField(source="client.profile_status", read_only=True)
    date_of_birth = serializers.DateField(source="client.date_of_birth", read_only=True, allow_null=True)


# ==============================================================================
# Véhicule résumé pour le management
# ==============================================================================


class ReservationManagementVehicleSummarySerializer(serializers.Serializer):
    """Véhicule résumé pour le management."""

    id = serializers.IntegerField(read_only=True)
    brand = serializers.CharField(source="brand.name", read_only=True)
    model_name = serializers.CharField(read_only=True)
    category = serializers.CharField(source="category.name", read_only=True)
    year = serializers.IntegerField(read_only=True)
    color = serializers.CharField(read_only=True)
    registration_plate = serializers.CharField(source="registration_number", read_only=True)
    energy_type = serializers.CharField(read_only=True)
    transmission = serializers.CharField(read_only=True)
    seats = serializers.IntegerField(read_only=True)
    doors = serializers.IntegerField(read_only=True)


class ReservationManagementInspectionSerializer(serializers.ModelSerializer):
    photos = InspectionPhotoReadSerializer(many=True, read_only=True)
    damages = InspectionDamageReadSerializer(many=True, read_only=True)

    class Meta:
        model = Inspection
        fields = [
            "id",
            "inspection_type",
            "status",
            "mileage",
            "energy_level_percent",
            "comments",
            "has_critical_issue",
            "critical_issue_description",
            "started_at",
            "completed_at",
            "completed_by",
            "created_at",
            "updated_at",
            "photos",
            "damages",
        ]


# ==============================================================================
# Réservation en list/detail pour le management
# ==============================================================================


class ReservationManagementListSerializer(serializers.ModelSerializer):
    """Réservation en liste pour le management."""

    vehicle = ReservationManagementVehicleSummarySerializer(read_only=True)
    client_summary = ReservationManagementClientSummarySerializer(source="*", read_only=True)
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "client_summary",
            "vehicle",
            "start_at",
            "end_at",
            "status",
            "rental_amount",
            "deposit_amount",
            "created_at",
            "confirmed_at",
            "cancelled_at",
        ]


class ReservationManagementDetailSerializer(serializers.ModelSerializer):
    """Réservation en détail pour le management."""

    vehicle = ReservationManagementVehicleSummarySerializer(read_only=True)
    client_summary = ReservationManagementClientSummarySerializer(source="*", read_only=True)
    deposit_status = serializers.SerializerMethodField()
    departure_inspection = serializers.SerializerMethodField()
    return_inspection = serializers.SerializerMethodField()
    interventions = serializers.SerializerMethodField()
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "client_summary",
            "vehicle",
            "start_at",
            "end_at",
            "status",
            "rental_amount",
            "deposit_amount",
            "deposit_status",
            "departure_inspection",
            "return_inspection",
            "interventions",
            "created_at",
            "confirmed_at",
            "cancelled_at",
            "cancellation_reason",
        ]

    def _get_inspection(self, obj, inspection_type):
        inspections = getattr(obj, "prefetched_inspections", None)
        if inspections is None:
            inspections = list(
                obj.inspections.select_related("completed_by").prefetch_related(
                    "photos",
                    "damages",
                    "damages__evidence_photos",
                )
            )

        for inspection in inspections:
            if inspection.inspection_type == inspection_type:
                return inspection
        return None

    def get_deposit_status(self, obj):
        deposits = getattr(obj, "prefetched_deposits", None)
        if deposits is None:
            deposit = obj.deposits.order_by("-created_at", "-id").first()
        else:
            deposit = deposits[0] if deposits else None

        return getattr(deposit, "status", None)

    def get_departure_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.INITIAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_return_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.FINAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_interventions(self, obj):
        interventions = getattr(obj, "prefetched_interventions", None)
        if interventions is None:
            interventions = list(
                obj.interventions.select_related(
                    "vehicle",
                    "vehicle__brand",
                    "reservation",
                    "assigned_to",
                    "assigned_to__role",
                    "created_by",
                    "created_by__role",
                )
            )
        return InterventionManagementResponseSerializer(interventions, many=True, context=self.context).data


class ReservationManagementCompleteRequestSerializer(serializers.Serializer):
    confirm_vehicle_available = serializers.BooleanField(required=False, default=True)


class ReservationManagementCompleteResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)


class ReservationManagementIssueRequestSerializer(serializers.Serializer):
    anomaly_type = serializers.ChoiceField(
        choices=[
            ("MECANIQUE", "Mecanique"),
            ("ACCIDENT", "Accident"),
            ("NETTOYAGE", "Nettoyage"),
            ("AUTRE", "Autre"),
        ]
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    vehicle_status = serializers.ChoiceField(
        choices=[
            Vehicle.Status.MAINTENANCE,
            Vehicle.Status.ACCIDENTE,
            Vehicle.Status.NETTOYAGE,
            Vehicle.Status.A_CONTROLER,
            Vehicle.Status.INDISPONIBLE,
        ]
    )
    evidence_files = serializers.ListField(
        child=serializers.ImageField(),
        required=False,
        allow_empty=True,
    )


class ReservationManagementIssueResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)
    intervention = InterventionManagementResponseSerializer(read_only=True, allow_null=True)
