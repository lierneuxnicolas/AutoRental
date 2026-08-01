from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsManagerOrAdministrator
from vehicles.models import Vehicle, VehiclePhoto
from vehicles.serializers.photos import VehiclePhotoCreateSerializer, VehiclePhotoReadSerializer


ErrorDetailResponseSerializer = OpenApiResponse(
	description="Erreur de validation ou ressource introuvable."
)


class VehiclePhotoCreateView(APIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	parser_classes = [MultiPartParser, FormParser]

	def get_vehicle(self, pk):
		return get_object_or_404(
			Vehicle.objects.select_related("brand", "category", "parking_space", "parking_space__parking"),
			id=pk,
		)

	@extend_schema(
		tags=["Vehicle Management"],
		request={"multipart/form-data": VehiclePhotoCreateSerializer},
		responses={
			201: VehiclePhotoReadSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, pk):
		vehicle = self.get_vehicle(pk)
		serializer = VehiclePhotoCreateSerializer(data=request.data, context={"vehicle": vehicle})
		serializer.is_valid(raise_exception=True)
		photo = serializer.save()
		response_serializer = VehiclePhotoReadSerializer(photo, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class VehiclePhotoDeleteView(APIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]

	def get_vehicle(self, pk):
		return get_object_or_404(
			Vehicle.objects.select_related("brand", "category", "parking_space", "parking_space__parking"),
			id=pk,
		)

	@extend_schema(
		tags=["Vehicle Management"],
		responses={
			204: None,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def delete(self, request, pk, photo_id):
		vehicle = self.get_vehicle(pk)
		photo = get_object_or_404(VehiclePhoto.objects.select_related("vehicle"), id=photo_id, vehicle=vehicle)

		with transaction.atomic():
			was_primary = photo.is_primary
			photo_file = photo.file
			photo.delete()

			if was_primary:
				next_photo = (
					VehiclePhoto.objects.select_for_update()
					.filter(vehicle=vehicle)
					.order_by("position", "created_at", "id")
					.first()
				)
				if next_photo is not None and not next_photo.is_primary:
					next_photo.is_primary = True
					next_photo.save(update_fields=["is_primary", "updated_at"])

		# Keep storage clean for local media: remove orphaned file using Django storage API.
		if photo_file:
			photo_file.delete(save=False)

		return Response(status=status.HTTP_204_NO_CONTENT)
