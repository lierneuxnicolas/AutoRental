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
	save_departure_vehicle_state,
)
from inspections.services.return_inspection import complete_return_inspection, create_return_inspection, save_return_vehicle_state
from reservations.models import Reservation


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou ressource introuvable.")
UPLOAD_PHOTO_TYPES = [
	InspectionPhoto.PhotoType.AVANT,
	InspectionPhoto.PhotoType.ARRIERE,
	InspectionPhoto.PhotoType.COTE_GAUCHE,
	InspectionPhoto.PhotoType.COTE_DROIT,
	InspectionPhoto.PhotoType.INTERIEUR,
	InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
	InspectionPhoto.PhotoType.DOMMAGE,
	InspectionPhoto.PhotoType.AUTRE,
]


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


class DepartureVehicleStateRequestSerializer(serializers.Serializer):
	mileage = serializers.IntegerField(min_value=0)
	energy_level_percent = serializers.IntegerField(min_value=0, max_value=100)
	anomaly_present = serializers.BooleanField()
	anomaly_description = serializers.CharField(required=False, allow_blank=True, default="")
	anomaly_severity = serializers.ChoiceField(choices=Damage.Severity.choices, required=False, allow_null=True)
	photo_ids = serializers.ListField(
		child=serializers.IntegerField(min_value=1),
		required=False,
		allow_empty=True,
		default=list,
	)

	def validate(self, attrs):
		anomaly_present = attrs.get("anomaly_present", False)
		if anomaly_present:
			description = (attrs.get("anomaly_description") or "").strip()
			if not description:
				raise serializers.ValidationError({"anomaly_description": "La description de l'anomalie est obligatoire."})
			if not attrs.get("anomaly_severity"):
				raise serializers.ValidationError({"anomaly_severity": "La gravite de l'anomalie est obligatoire."})
		else:
			attrs["anomaly_description"] = ""
			attrs["anomaly_severity"] = None

		attrs["photo_ids"] = attrs.get("photo_ids") or []
		return attrs


class DepartureVehicleStateResponseSerializer(serializers.Serializer):
	inspection = InspectionSummarySerializer(read_only=True)
	damage = InspectionDamageReadSerializer(read_only=True, allow_null=True)
	vehicle_status = serializers.CharField(read_only=True)


class ReturnInspectionCreateView(generics.GenericAPIView):
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
			"Cree l'etat des lieux FINAL de retour pour une reservation EN_COURS, "
			"si l'inspection INITIAL est deja terminee et qu'aucune inspection FINAL n'existe encore."
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
			inspection = create_return_inspection(reservation=reservation, requested_by=request.user)
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
		request={
			"multipart/form-data": {
				"type": "object",
				"properties": {
					"file": {"type": "string", "format": "binary"},
					"photo_type": {
						"type": "string",
						"enum": UPLOAD_PHOTO_TYPES,
					},
					"position": {"type": "integer", "minimum": 0},
				},
				"required": ["file", "photo_type"],
			}
		},
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
			if inspection.inspection_type == Inspection.Type.FINAL:
				completed_inspection = complete_return_inspection(
					inspection=inspection,
					requested_by=request.user,
					mileage=serializer.validated_data["mileage"],
					energy_level_percent=serializer.validated_data["energy_level_percent"],
					comments=serializer.validated_data.get("comments", ""),
				)
			else:
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


class DepartureVehicleStateUpsertView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
	serializer_class = DepartureVehicleStateRequestSerializer
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
			"Enregistre l'etape Etat du vehicule pour une inspection INITIAL: kilometrage, niveau d'energie "
			"et anomalie eventuelle (description, gravite, photos)."
		),
		request=DepartureVehicleStateRequestSerializer,
		responses={
			200: DepartureVehicleStateResponseSerializer,
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
			if inspection.inspection_type == Inspection.Type.FINAL:
				updated_inspection, created_damage, vehicle_status = save_return_vehicle_state(
					inspection=inspection,
					requested_by=request.user,
					mileage=serializer.validated_data["mileage"],
					energy_level_percent=serializer.validated_data["energy_level_percent"],
					anomaly_present=serializer.validated_data["anomaly_present"],
					anomaly_description=serializer.validated_data.get("anomaly_description", ""),
					anomaly_severity=serializer.validated_data.get("anomaly_severity"),
					photo_ids=serializer.validated_data.get("photo_ids", []),
				)
			else:
				updated_inspection, created_damage, vehicle_status = save_departure_vehicle_state(
					inspection=inspection,
					requested_by=request.user,
					mileage=serializer.validated_data["mileage"],
					energy_level_percent=serializer.validated_data["energy_level_percent"],
					anomaly_present=serializer.validated_data["anomaly_present"],
					anomaly_description=serializer.validated_data.get("anomaly_description", ""),
					anomaly_severity=serializer.validated_data.get("anomaly_severity"),
					photo_ids=serializer.validated_data.get("photo_ids", []),
				)
		except DepartureInspectionError as exc:
			detail = {"code": exc.code, "message": exc.message}
			if exc.details:
				detail["details"] = exc.details
			return Response(detail, status=status.HTTP_400_BAD_REQUEST)

		payload = {
			"inspection": updated_inspection,
			"damage": created_damage,
			"vehicle_status": vehicle_status,
		}
		return Response(DepartureVehicleStateResponseSerializer(payload).data, status=status.HTTP_200_OK)
