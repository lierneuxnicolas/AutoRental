from django.db.models import Prefetch
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny

from vehicles.filters import VehiclePublicFilter
from vehicles.models import Parking, Vehicle, VehicleCategory, VehicleEquipment
from vehicles.serializers import (
	ParkingPublicSerializer,
	VehicleAvailabilityQuerySerializer,
	VehicleCategoryPublicSerializer,
	VehiclePublicDetailSerializer,
	VehiclePublicSerializer,
)
from vehicles.services import get_available_vehicles


ErrorDetailResponseSerializer = OpenApiResponse(
	description="Erreur de validation ou ressource introuvable."
)


class VehiclePublicListView(generics.ListAPIView):
	permission_classes = [AllowAny]
	serializer_class = VehiclePublicSerializer
	filterset_class = VehiclePublicFilter
	search_fields = ["brand__name", "model_name"]
	ordering_fields = ["category__daily_rate", "year", "model_name"]
	ordering = ["brand__name", "model_name"]

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Vehicle.objects.none()

		return (
			Vehicle.objects.filter(
				is_active=True,
				brand__is_active=True,
				category__is_active=True,
				parking_space__is_active=True,
				parking_space__parking__is_active=True,
			)
			.select_related("brand", "category", "parking_space", "parking_space__parking")
			.prefetch_related(
				"photos",
				Prefetch(
					"equipment",
					queryset=VehicleEquipment.objects.filter(is_active=True).order_by("label"),
				),
			)
		)

	def _serialize_period_query(self, *, minimum_hours=None):
		query_serializer = VehicleAvailabilityQuerySerializer(
			data=self.request.query_params,
			context={"minimum_hours": minimum_hours},
		)
		query_serializer.is_valid(raise_exception=True)
		return query_serializer.validated_data

	@extend_schema(
		tags=["Vehicles"],
		auth=[],
		responses={
			200: VehiclePublicSerializer(many=True),
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class VehicleAvailablePublicListView(VehiclePublicListView):
	"""Public availability search — indicative results only.

	This endpoint does NOT lock any vehicle, does NOT create a reservation, and
	does NOT guarantee that a vehicle returned here will still be available at
	payment time.  Availability is re-verified at reservation creation, before
	PaymentIntent creation, and inside the Stripe webhook (see
	vehicles.services.availability.is_vehicle_available).

	Minimum duration strategy: validate once against the lowest minimum rental
	hours among active categories, then keep only categories compatible with the
	requested duration.
	"""

	def _get_global_minimum_rental_hours(self):
		return (
			VehicleCategory.objects.filter(is_active=True)
			.order_by("minimum_rental_hours")
			.values_list("minimum_rental_hours", flat=True)
			.first()
		)

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Vehicle.objects.none()

		base_queryset = super().get_queryset()
		minimum_hours = self._get_global_minimum_rental_hours()
		period = self._serialize_period_query(minimum_hours=minimum_hours)

		queryset = get_available_vehicles(
			start=period["start"],
			end=period["end"],
			base_queryset=base_queryset,
		)
		return queryset.filter(category__minimum_rental_hours__lte=period["duration_hours"])

	@extend_schema(
		tags=["Vehicles"],
		auth=[],
		description=(
			"La disponibilité retournée est indicative et sera vérifiée à nouveau lors de la "
			"réservation et du paiement."
		),
		parameters=[
			OpenApiParameter(
				name="start",
				type=str,
				location=OpenApiParameter.QUERY,
				required=True,
				description="Date et heure de debut au format ISO 8601 (ex: 2030-01-01T10:00:00+01:00).",
			),
			OpenApiParameter(
				name="end",
				type=str,
				location=OpenApiParameter.QUERY,
				required=True,
				description="Date et heure de fin au format ISO 8601 (ex: 2030-01-01T13:00:00+01:00).",
			),
		],
		responses={200: VehiclePublicSerializer(many=True)},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class VehiclePublicDetailView(generics.RetrieveAPIView):
	permission_classes = [AllowAny]
	serializer_class = VehiclePublicDetailSerializer
	lookup_field = "id"
	lookup_url_kwarg = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Vehicle.objects.none()

		return (
			Vehicle.objects.filter(
				is_active=True,
				brand__is_active=True,
				category__is_active=True,
				parking_space__is_active=True,
				parking_space__parking__is_active=True,
			)
			.select_related("brand", "category", "parking_space", "parking_space__parking")
			.prefetch_related(
				"photos",
				Prefetch(
					"equipment",
					queryset=VehicleEquipment.objects.filter(is_active=True).order_by("label"),
				),
			)
		)

	@extend_schema(
		tags=["Vehicles"],
		auth=[],
		responses={
			200: VehiclePublicDetailSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class VehicleCategoryPublicListView(generics.ListAPIView):
	permission_classes = [AllowAny]
	serializer_class = VehicleCategoryPublicSerializer
	pagination_class = None

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return VehicleCategory.objects.none()
		return VehicleCategory.objects.filter(is_active=True)

	@extend_schema(
		tags=["Vehicle Categories"],
		auth=[],
		responses={200: VehicleCategoryPublicSerializer(many=True)},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class ParkingPublicListView(generics.ListAPIView):
	permission_classes = [AllowAny]
	serializer_class = ParkingPublicSerializer
	pagination_class = None

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Parking.objects.none()
		return Parking.objects.filter(is_active=True)

	@extend_schema(
		tags=["Parkings"],
		auth=[],
		responses={200: ParkingPublicSerializer(many=True)},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)
