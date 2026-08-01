from rest_framework import serializers

from reservations.models import Reservation


ALLOWED_CREATE_FIELDS = {"vehicle_id", "start_at", "end_at"}
FORBIDDEN_CREATE_FIELDS = {
    "client",
    "reference",
    "status",
    "rental_amount",
    "deposit_amount",
    "confirmed_at",
    "cancelled_at",
    "cancellation_reason",
}


class ReservationVehicleSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    brand = serializers.CharField(source="brand.name", read_only=True)
    model_name = serializers.CharField(read_only=True)
    category = serializers.CharField(source="category.name", read_only=True)
    year = serializers.IntegerField(read_only=True)
    color = serializers.CharField(read_only=True)
    fuel_type = serializers.CharField(source="energy_type", read_only=True)
    transmission = serializers.CharField(read_only=True)
    seats = serializers.IntegerField(read_only=True)
    doors = serializers.IntegerField(read_only=True)


class ReservationCreateRequestSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(required=True)
    start_at = serializers.DateTimeField(required=True)
    end_at = serializers.DateTimeField(required=True)

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            keys = set(data.keys())
            forbidden_provided = sorted(keys & FORBIDDEN_CREATE_FIELDS)
            if forbidden_provided:
                raise serializers.ValidationError(
                    {field: ["Ce champ est gere par le backend."] for field in forbidden_provided}
                )

            unexpected_fields = sorted(keys - ALLOWED_CREATE_FIELDS)
            if unexpected_fields:
                raise serializers.ValidationError(
                    {field: ["Ce champ n'est pas autorise."] for field in unexpected_fields}
                )

        return super().to_internal_value(data)


class ReservationListDetailSerializer(serializers.ModelSerializer):
    vehicle = ReservationVehicleSummarySerializer(read_only=True)
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
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


class ReservationCreateResponseSerializer(ReservationListDetailSerializer):
    pass
