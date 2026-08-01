from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from reservations.services.pricing import PricingError
from vehicles.models import Vehicle


ALLOWED_REQUEST_FIELDS = {"vehicle_id", "start_at", "end_at"}


class PriceSimulationRequestSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(required=True)
    start_at = serializers.DateTimeField(
        required=True,
        error_messages={
            "required": "Le champ start_at est obligatoire.",
            "invalid": "Le champ start_at doit etre un datetime ISO 8601 valide.",
        },
    )
    end_at = serializers.DateTimeField(
        required=True,
        error_messages={
            "required": "Le champ end_at est obligatoire.",
            "invalid": "Le champ end_at doit etre un datetime ISO 8601 valide.",
        },
    )

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unexpected_fields = sorted(set(data.keys()) - ALLOWED_REQUEST_FIELDS)
            if unexpected_fields:
                raise serializers.ValidationError(
                    {
                        field: ["Ce champ n'est pas autorise."]
                        for field in unexpected_fields
                    }
                )

        return super().to_internal_value(data)

    def validate(self, attrs):
        start_at = attrs["start_at"]
        end_at = attrs["end_at"]

        if end_at <= start_at:
            raise serializers.ValidationError({"end_at": ["La date de fin doit etre apres la date de debut."]})

        if self._is_start_in_past(start_at):
            raise serializers.ValidationError({"start_at": ["La date de debut ne peut pas etre dans le passe."]})

        return attrs

    def _is_start_in_past(self, start_at) -> bool:
        reference = self.context.get("now")
        if reference is None:
            from django.utils import timezone

            reference = timezone.now()
        return start_at < reference

    def validate_vehicle_id(self, value):
        if value is None:
            raise serializers.ValidationError("Le champ vehicle_id est obligatoire.")
        return value


class PriceSimulationResponseSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField()
    duration_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    insurance_included = serializers.BooleanField()
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def to_representation(self, instance):
        if isinstance(instance, PricingError):
            raise serializers.ValidationError({"non_field_errors": [instance.message]})

        return super().to_representation(instance)

    @classmethod
    def from_service_result(cls, result):
        return cls(result).data


def pricing_error_to_serializer_error(error: PricingError) -> serializers.ValidationError:
    return serializers.ValidationError({"non_field_errors": [error.message]}, code=error.code)


def simulate_price_response_payload(
    *,
    vehicle_id: int,
    duration_hours: Decimal,
    rental_amount: Decimal,
    deposit_amount: Decimal,
    insurance_included: bool,
    total_amount: Decimal,
):
    return {
        "vehicle_id": vehicle_id,
        "duration_hours": duration_hours,
        "rental_amount": rental_amount,
        "deposit_amount": deposit_amount,
        "insurance_included": insurance_included,
        "total_amount": total_amount,
    }
