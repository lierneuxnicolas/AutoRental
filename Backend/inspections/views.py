from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsClient, IsReservationOwner
from inspections.models import Damage, Inspection, InspectionPhoto
from inspections.serializers import (
	InspectionDamageCreateSerializer,
	InspectionDamageReadSerializer,
	InspectionPhotoCreateSerializer,
	InspectionPhotoReadSerializer,
	get_mandatory_photo_types,
	get_missing_mandatory_photo_types,
)
from inspections.services.departure import (
	MANDATORY_PHOTO_TYPES,
	MISSING_FIELDS,
	DepartureInspectionError,
	complete_departure_inspection,
	create_departure_inspection,
)
from reservations.models import Reservation


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou ressource introuvable.")


class InspectionSummarySerializer(serializers.ModelSerializer):
	class Meta:
		model = Inspection
		fields = [
			"id",
			"reservation",
			"inspection_type",
			"status",
			"mileage",
			"energy_level_percent",
			"comments",
			"has_critical_issue",
			"critical_issue_description",
			"started_at",
			"completed_at",
			"completed_by",
			"created_at",
			"updated_at",
		]


class DepartureInspectionResponseSerializer(serializers.Serializer):
	inspection = InspectionSummarySerializer(read_only=True)
	mandatory_photo_types = serializers.ListField(child=serializers.CharField(), read_only=True)
	missing_fields = serializers.ListField(child=serializers.CharField(), read_only=True)


class CompleteDepartureInspectionRequestSerializer(serializers.Serializer):
	mileage = serializers.IntegerField(min_value=0)
	energy_level_percent = serializers.IntegerField(min_value=0, max_value=100)
	comments = serializers.CharField(required=False, allow_blank=True, default="")


class DepartureInspectionCreateView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
	serializer_class = DepartureInspectionResponseSerializer
	lookup_field = "id"
	lookup_url_kwarg = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Reservation.objects.none()

		return Reservation.objects.filter(client__user=self.request.user).select_related(
			"client",
			"client__user",
			"vehicle",
			"vehicle__brand",
			"vehicle__category",
		)

	def get_object(self):
		queryset = self.get_queryset()
		reservation = get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])
		self.check_object_permissions(self.request, reservation)
		return reservation

	@extend_schema(
		tags=["Inspections"],
		description=(
			"Cree l'etat des lieux INITIAL de depart pour une reservation CONFIRMEE, "
			"a condition que le paiement soit REUSSI, que la caution soit AUTORISEE "
			"et que la fenetre horaire autorisee soit respectee."
		),
		responses={
			200: DepartureInspectionResponseSerializer,
			400: DepartureInspectionResponseSerializer,
			401: DepartureInspectionResponseSerializer,
			403: DepartureInspectionResponseSerializer,
			404: DepartureInspectionResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		reservation = self.get_object()

		try:
			inspection = create_departure_inspection(reservation=reservation, requested_by=request.user)
		except DepartureInspectionError as exc:
			detail = {"code": exc.code, "message": exc.message}
			if exc.details:
				detail["details"] = exc.details
			return Response(detail, status=status.HTTP_400_BAD_REQUEST)

		response_data = {
			"inspection": inspection,
				"mandatory_photo_types": get_mandatory_photo_types(inspection),
			"missing_fields": MISSING_FIELDS,
		}
		return Response(DepartureInspectionResponseSerializer(response_data).data, status=status.HTTP_200_OK)


class InspectionPhotoCreateView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
	serializer_class = InspectionPhotoCreateSerializer
	parser_classes = [MultiPartParser, FormParser]
	lookup_field = "id"
	lookup_url_kwarg = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Inspection.objects.none()

		return (
			Inspection.objects.select_related("reservation", "reservation__client", "reservation__client__user", "reservation__vehicle")
			.filter(reservation__client__user=self.request.user)
		)

	def get_object(self):
		queryset = self.get_queryset()
		inspection = get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])
		self.check_object_permissions(self.request, inspection.reservation)
		return inspection

	@extend_schema(
		tags=["Inspections"],
		request={"multipart/form-data": InspectionPhotoCreateSerializer},
		responses={
			201: InspectionPhotoReadSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		inspection = self.get_object()
		serializer = self.get_serializer(data=request.data, context={"inspection": inspection, "requested_by": request.user})
		serializer.is_valid(raise_exception=True)

		with transaction.atomic():
			photo = serializer.save()

		response_serializer = InspectionPhotoReadSerializer(photo, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class InspectionDamageCreateView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
	serializer_class = InspectionDamageCreateSerializer
	lookup_field = "id"
	lookup_url_kwarg = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Inspection.objects.none()

		return (
			Inspection.objects.select_related("reservation", "reservation__client", "reservation__client__user", "reservation__vehicle")
			.filter(reservation__client__user=self.request.user)
		)

	def get_object(self):
		queryset = self.get_queryset()
		inspection = get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])
		self.check_object_permissions(self.request, inspection.reservation)
		return inspection

	@extend_schema(
		tags=["Inspections"],
		request=InspectionDamageCreateSerializer,
		responses={
			201: InspectionDamageReadSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		inspection = self.get_object()
		serializer = self.get_serializer(data=request.data, context={"inspection": inspection, "requested_by": request.user})
		serializer.is_valid(raise_exception=True)

		with transaction.atomic():
			damage = serializer.save()

		response_serializer = InspectionDamageReadSerializer(damage, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class DepartureInspectionCompleteView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
	serializer_class = CompleteDepartureInspectionRequestSerializer
	lookup_field = "id"
	lookup_url_kwarg = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Inspection.objects.none()

		return Inspection.objects.select_related(
			"reservation",
			"reservation__client",
			"reservation__client__user",
			"reservation__vehicle",
			"reservation__vehicle__brand",
			"reservation__vehicle__category",
		).filter(reservation__client__user=self.request.user)

	def get_object(self):
		queryset = self.get_queryset()
		inspection = get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])
		self.check_object_permissions(self.request, inspection.reservation)
		return inspection

	@extend_schema(
		tags=["Inspections"],
		description=(
			"Cloture l'etat des lieux INITIAL de depart si toutes les preconditions metier sont satisfaites. "
			"Le point d'integration d'acces vehicule est prepare, sans declencher de deverrouillage reel."
		),
		request=CompleteDepartureInspectionRequestSerializer,
		responses={
			200: InspectionSummarySerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		inspection = self.get_object()
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		try:
			completed_inspection = complete_departure_inspection(
				inspection=inspection,
				requested_by=request.user,
				mileage=serializer.validated_data["mileage"],
				energy_level_percent=serializer.validated_data["energy_level_percent"],
				comments=serializer.validated_data.get("comments", ""),
			)
		except DepartureInspectionError as exc:
			detail = {"code": exc.code, "message": exc.message}
			if exc.details:
				detail["details"] = exc.details
			return Response(detail, status=status.HTTP_400_BAD_REQUEST)

		return Response(InspectionSummarySerializer(completed_inspection).data, status=status.HTTP_200_OK)
