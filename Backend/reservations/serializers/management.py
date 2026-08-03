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
from reservations.models import Reservation


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
            "cancellation_reason",
        ]
