from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny

from vehicles.filters import VehiclePublicFilter
from vehicles.models import Parking, Vehicle, VehicleCategory
from vehicles.serializers import ParkingPublicSerializer, VehicleCategoryPublicSerializer, VehiclePublicSerializer


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
			.prefetch_related("photos")
		)

	@extend_schema(
		tags=["Vehicles"],
		auth=[],
		responses={
			200: VehiclePublicSerializer(many=True),
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class VehiclePublicDetailView(generics.RetrieveAPIView):
	permission_classes = [AllowAny]
	serializer_class = VehiclePublicSerializer
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
			.prefetch_related("photos")
		)

	@extend_schema(
		tags=["Vehicles"],
		auth=[],
		responses={
			200: VehiclePublicSerializer,
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
