from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsManagerOrAdministrator
from vehicles.models import Vehicle
from vehicles.serializers.management import VehicleManagementWriteSerializer, VehicleStatusUpdateSerializer
from vehicles.serializers.public import VehiclePublicSerializer


ErrorDetailResponseSerializer = OpenApiResponse(
	description="Erreur de validation ou ressource introuvable."
)


class VehicleManagementCreateView(generics.CreateAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = VehicleManagementWriteSerializer

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Vehicle.objects.none()
		return Vehicle.objects.select_related("brand", "category", "parking_space", "parking_space__parking")

	@extend_schema(
		tags=["Vehicle Management"],
		responses={
			201: VehiclePublicSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		vehicle = serializer.save()
		response_serializer = VehiclePublicSerializer(vehicle, context=self.get_serializer_context())
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class VehicleManagementUpdateView(generics.UpdateAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = VehicleManagementWriteSerializer
	lookup_field = "id"
	lookup_url_kwarg = "pk"
	http_method_names = ["patch"]

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Vehicle.objects.none()
		return Vehicle.objects.select_related("brand", "category", "parking_space", "parking_space__parking")

	@extend_schema(
		tags=["Vehicle Management"],
		responses={
			200: VehiclePublicSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def patch(self, request, *args, **kwargs):
		partial = kwargs.pop("partial", True)
		instance = self.get_object()
		serializer = self.get_serializer(instance, data=request.data, partial=partial)
		serializer.is_valid(raise_exception=True)
		vehicle = serializer.save()
		response_serializer = VehiclePublicSerializer(vehicle, context=self.get_serializer_context())
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class VehicleManagementStatusUpdateView(APIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]

	def get_vehicle(self, pk):
		return generics.get_object_or_404(
			Vehicle.objects.select_related("brand", "category", "parking_space", "parking_space__parking"),
			id=pk,
		)

	@extend_schema(
		tags=["Vehicle Management"],
		request=VehicleStatusUpdateSerializer,
		responses={
			200: VehiclePublicSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def patch(self, request, pk):
		vehicle = self.get_vehicle(pk)
		serializer = VehicleStatusUpdateSerializer(data=request.data, context={"vehicle": vehicle})
		serializer.is_valid(raise_exception=True)

		vehicle.status = serializer.validated_data["status"]
		vehicle.save(update_fields=["status", "updated_at"])

		response_serializer = VehiclePublicSerializer(vehicle, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)
