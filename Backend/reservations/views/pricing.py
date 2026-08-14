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
from vehicles.services import AvailabilityValidationError, get_blocking_reservation_statuses, is_vehicle_available


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


def _resolve_reservation_context(payload):
    reservation_id = payload.get("reservation_id")
    if reservation_id is None:
        return None

    reservation_model = apps.get_model("reservations", "Reservation")
    if reservation_model is None:
        raise ImproperlyConfigured("The reservations.Reservation model is required for reservation context simulation.")

    reservation = (
        reservation_model.objects.select_related("vehicle")
        .filter(pk=reservation_id)
        .first()
    )
    if reservation is None:
        return "NOT_FOUND"

    if reservation.vehicle_id != payload["vehicle_id"]:
        return "VEHICLE_MISMATCH"

    if reservation.start_at != payload["start_at"] or reservation.end_at != payload["end_at"]:
        return "PERIOD_MISMATCH"

    return reservation


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

        try:
            reservation_context = _resolve_reservation_context(payload)
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

        if reservation_context == "NOT_FOUND":
            return Response(
                {"detail": "La reservation de contexte est introuvable."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if reservation_context == "VEHICLE_MISMATCH":
            return Response(
                {"detail": "La reservation de contexte ne correspond pas au vehicule demande."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if reservation_context == "PERIOD_MISMATCH":
            return Response(
                {"detail": "La reservation de contexte ne correspond pas a la periode demandee."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        vehicle = (
            Vehicle.objects.select_related("category", "brand")
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

        if reservation_context is None and vehicle.status not in (Vehicle.Status.DISPONIBLE,):
            return Response(
                {"detail": "Le vehicule n'est pas reservable dans son statut actuel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Availability stays indicative at simulation step and will be rechecked later.
        try:
            reservation_queryset = _get_indicative_reservation_queryset()
            if reservation_context is not None:
                reservation_queryset = reservation_queryset.exclude(pk=reservation_context.pk)
                overlap_exists = reservation_queryset.filter(
                    vehicle_id=vehicle.pk,
                    status__in=get_blocking_reservation_statuses(),
                    start_at__lt=payload["end_at"],
                    end_at__gt=payload["start_at"],
                ).exists()
                is_available = (
                    vehicle.is_active
                    and vehicle.brand.is_active
                    and vehicle.category.is_active
                    and not overlap_exists
                )
            else:
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
            effective_insurance_type = payload.get("insurance_type")
            if effective_insurance_type is None and reservation_context is not None:
                effective_insurance_type = reservation_context.insurance_type

            pricing_result = calculate_price_simulation(
                vehicle=vehicle,
                start_at=payload["start_at"],
                end_at=payload["end_at"],
                insurance_type=effective_insurance_type or "STANDARD",
            )
        except PricingError as exc:
            error = pricing_error_to_serializer_error(exc)
            message = error.detail.get("non_field_errors", ["Erreur de tarification."])[0]
            return Response({"detail": str(message)}, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = PriceSimulationResponseSerializer(pricing_result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
