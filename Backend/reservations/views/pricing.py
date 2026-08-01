from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from reservations.serializers import PriceSimulationRequestSerializer, PriceSimulationResponseSerializer
from reservations.serializers.pricing import pricing_error_to_serializer_error
from reservations.services import PricingError, calculate_price_simulation
from vehicles.models import Vehicle
from vehicles.services import AvailabilityValidationError, is_vehicle_available


ErrorDetailResponseSerializer = inline_serializer(
    name="PriceSimulationErrorDetailResponse",
    fields={"detail": drf_serializers.CharField()},
)


class _NoReservationConflictQuerySet:
    """Minimal reservation-like queryset adapter for indicative simulation checks."""

    def filter(self, **kwargs):
        return self

    def exists(self):
        return False


def _get_indicative_reservation_queryset():
    """Use real reservations when available, otherwise keep an indicative fallback."""

    try:
        reservation_model = apps.get_model("reservations", "Reservation")
    except LookupError:
        return _NoReservationConflictQuerySet()

    if reservation_model is None:
        return _NoReservationConflictQuerySet()

    return reservation_model.objects.all()


class PriceSimulationView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Simulations"],
        auth=[],
        description=(
            "Calcule une estimation tarifaire sans creer de reservation ni bloquer le vehicule. "
            "La disponibilite retournee est indicative et sera verifiee a nouveau lors de la "
            "reservation et du paiement."
        ),
        request=PriceSimulationRequestSerializer,
        responses={
            200: PriceSimulationResponseSerializer,
            400: OpenApiResponse(response=ErrorDetailResponseSerializer),
            404: OpenApiResponse(response=ErrorDetailResponseSerializer),
        },
    )
    def post(self, request):
        request_serializer = PriceSimulationRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        payload = request_serializer.validated_data

        vehicle = (
            Vehicle.objects.select_related("category")
            .filter(pk=payload["vehicle_id"], is_active=True)
            .first()
        )
        if vehicle is None:
            vehicle_exists = Vehicle.objects.filter(pk=payload["vehicle_id"]).exists()
            if vehicle_exists:
                return Response(
                    {"detail": "Le vehicule demande est inactif."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": "Le vehicule demande est introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if vehicle.status not in (Vehicle.Status.DISPONIBLE,):
            return Response(
                {"detail": "Le vehicule n'est pas reservable dans son statut actuel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Availability stays indicative at simulation step and will be rechecked later.
        try:
            reservation_queryset = _get_indicative_reservation_queryset()
            is_available = is_vehicle_available(
                vehicle=vehicle,
                start=payload["start_at"],
                end=payload["end_at"],
                reservation_queryset=reservation_queryset,
            )
        except ImproperlyConfigured:
            return Response(
                {
                    "detail": (
                        "La verification de disponibilite est temporairement indisponible. "
                        "Merci de reessayer plus tard."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AvailabilityValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not is_available:
            return Response(
                {
                    "detail": (
                        "Le vehicule est indisponible sur la periode demandee. "
                        "Cette verification est indicative et sera refaite lors de la reservation et du paiement."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pricing_result = calculate_price_simulation(
                vehicle=vehicle,
                start_at=payload["start_at"],
                end_at=payload["end_at"],
            )
        except PricingError as exc:
            error = pricing_error_to_serializer_error(exc)
            message = error.detail.get("non_field_errors", ["Erreur de tarification."])[0]
            return Response({"detail": str(message)}, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = PriceSimulationResponseSerializer(pricing_result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
