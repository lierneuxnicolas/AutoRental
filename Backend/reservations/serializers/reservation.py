from rest_framework import serializers

from inspections.models import Inspection
from inspections.serializers import InspectionPhotoReadSerializer
from reservations.models import Reservation
from reservations.services.pricing import PricingError, calculate_price_simulation
from vehicles.services import AvailabilityValidationError


ALLOWED_CREATE_FIELDS = {"vehicle_id", "start_at", "end_at", "insurance_type"}
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
    insurance_type = serializers.ChoiceField(
        choices=["STANDARD", "DUO", "OMNIUM"],
        required=False,
        default="STANDARD",
    )

    @staticmethod
    def _validate_hour_precision(value):
        if value.minute != 0:
            raise serializers.ValidationError(
                "Les heures de reservation doivent etre a l'heure pleine (minutes = 00)."
            )
        return value

    def validate_start_at(self, value):
        return self._validate_hour_precision(value)

    def validate_end_at(self, value):
        return self._validate_hour_precision(value)

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
    insurance_type = serializers.CharField(read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_amount = serializers.SerializerMethodField()

    def get_total_amount(self, obj):
        try:
            pricing = calculate_price_simulation(
                vehicle=obj.vehicle,
                start_at=obj.start_at,
                end_at=obj.end_at,
                insurance_type=obj.insurance_type,
            )
        except (PricingError, AvailabilityValidationError):
            return obj.rental_amount

        return pricing.total_amount

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
            "insurance_type",
            "deposit_amount",
            "total_amount",
            "created_at",
            "confirmed_at",
            "cancelled_at",
            "cancellation_reason",
        ]


class ReservationInspectionDetailSerializer(serializers.ModelSerializer):
    photos = InspectionPhotoReadSerializer(many=True, read_only=True)

    class Meta:
        model = Inspection
        fields = [
            "id",
            "inspection_type",
            "status",
            "mileage",
            "energy_level_percent",
            "completed_at",
            "started_at",
            "photos",
        ]


class ReservationCreateResponseSerializer(ReservationListDetailSerializer):
    pass


class ReservationClientDetailSerializer(ReservationListDetailSerializer):
    departure_inspection = serializers.SerializerMethodField()
    return_inspection = serializers.SerializerMethodField()

    class Meta(ReservationListDetailSerializer.Meta):
        fields = ReservationListDetailSerializer.Meta.fields + [
            "departure_inspection",
            "return_inspection",
        ]

    def _get_inspection(self, obj, inspection_type):
        inspections = getattr(obj, "prefetched_inspections", None)
        if inspections is None:
            inspections = list(
                obj.inspections.select_related("completed_by").prefetch_related("photos")
            )

        for inspection in inspections:
            if inspection.inspection_type == inspection_type:
                return inspection
        return None

    def get_departure_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.INITIAL)
        if inspection is None:
            return None
        return ReservationInspectionDetailSerializer(inspection, context=self.context).data

    def get_return_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.FINAL)
        if inspection is None:
            return None
        return ReservationInspectionDetailSerializer(inspection, context=self.context).data


# ==============================================================================
# Serializers pour l'annulation (point 39E)
# ==============================================================================


ALLOWED_CANCEL_FIELDS = {"reason"}
FORBIDDEN_CANCEL_FIELDS = {
    "id",
    "reference",
    "vehicle",
    "client",
    "start_at",
    "end_at",
    "status",
    "rental_amount",
    "deposit_amount",
    "confirmed_at",
    "cancelled_at",
    "cancellation_reason",
}


class ReservationCancelRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)

    def validate_reason(self, value):
        """Valide le motif d'annulation."""
        if not value or not value.strip():
            raise serializers.ValidationError("Le motif d'annulation ne peut pas être vide ou seulement des espaces.")
        if len(value.strip()) > 1000:
            raise serializers.ValidationError("Le motif d'annulation ne doit pas dépasser 1000 caractères.")
        return value.strip()

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            keys = set(data.keys())
            forbidden_provided = sorted(keys & FORBIDDEN_CANCEL_FIELDS)
            if forbidden_provided:
                raise serializers.ValidationError(
                    {field: ["Ce champ est géré par le backend."] for field in forbidden_provided}
                )

            unexpected_fields = sorted(keys - ALLOWED_CANCEL_FIELDS)
            if unexpected_fields:
                raise serializers.ValidationError(
                    {field: ["Ce champ n'est pas autorisé."] for field in unexpected_fields}
                )

        return super().to_internal_value(data)


class ReservationCancelResponseSerializer(serializers.Serializer):
    message = serializers.SerializerMethodField()
    reservation = ReservationListDetailSerializer()
    cancellation_financials = serializers.SerializerMethodField()

    def get_message(self, obj):
        return "Réservation annulée."

    def get_cancellation_financials(self, obj):
        payload = obj.get("cancellation_financials") if isinstance(obj, dict) else None
        serializer = ReservationCancellationFinancialsSerializer(instance=payload or {})
        return serializer.data


class ReservationCancellationFinancialsSerializer(serializers.Serializer):
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cancellation_fee = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    refundable_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_release = serializers.CharField(read_only=True)


class ReservationCancellationPreviewSerializer(serializers.Serializer):
    can_cancel = serializers.BooleanField(read_only=True)
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cancellation_fee = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    refundable_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_release = serializers.CharField(read_only=True)


ALLOWED_DEPOSIT_FIELDS = {"mode"}
FORBIDDEN_DEPOSIT_FIELDS = {
    "amount",
    "currency",
    "stripe_payment_intent_id",
    "status",
    "client_secret",
}


class ReservationDepositRequestSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["SIMULATED", "STRIPE_TEST"])

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            keys = set(data.keys())
            forbidden_provided = sorted(keys & FORBIDDEN_DEPOSIT_FIELDS)
            if forbidden_provided:
                raise serializers.ValidationError(
                    {field: ["Ce champ est gere par le backend."] for field in forbidden_provided}
                )

            unexpected_fields = sorted(keys - ALLOWED_DEPOSIT_FIELDS)
            if unexpected_fields:
                raise serializers.ValidationError(
                    {field: ["Ce champ n'est pas autorise."] for field in unexpected_fields}
                )

        return super().to_internal_value(data)


class ReservationDepositResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationListDetailSerializer(read_only=True)
    deposit_id = serializers.IntegerField(read_only=True)
    deposit_mode = serializers.CharField(read_only=True)
    deposit_status = serializers.CharField(read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    currency = serializers.CharField(read_only=True)
    stripe_payment_intent_id = serializers.CharField(read_only=True, allow_null=True)
    authorization_expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    authorized_at = serializers.DateTimeField(read_only=True, allow_null=True)
    client_secret = serializers.CharField(read_only=True, allow_null=True)
    authorization_note = serializers.CharField(read_only=True)


ALLOWED_PAYMENT_INTENT_FIELDS = set()
FORBIDDEN_PAYMENT_INTENT_FIELDS = {
    "amount",
    "currency",
    "payment_id",
    "client_secret",
    "stripe_payment_intent_id",
}


class ReservationPaymentIntentRequestSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            keys = set(data.keys())
            forbidden_provided = sorted(keys & FORBIDDEN_PAYMENT_INTENT_FIELDS)
            if forbidden_provided:
                raise serializers.ValidationError(
                    {field: ["Ce champ est gere par le backend."] for field in forbidden_provided}
                )

            unexpected_fields = sorted(keys - ALLOWED_PAYMENT_INTENT_FIELDS)
            if unexpected_fields:
                raise serializers.ValidationError(
                    {field: ["Ce champ n'est pas autorise."] for field in unexpected_fields}
                )

        return super().to_internal_value(data)


class ReservationPaymentIntentResponseSerializer(serializers.Serializer):
    client_secret = serializers.CharField(read_only=True, allow_null=True)
    payment_id = serializers.IntegerField(read_only=True)
