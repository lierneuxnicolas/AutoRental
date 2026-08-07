from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, status
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsCleaner, IsManagerOrAdministrator, IsMechanic
from interventions.models import Intervention
from interventions.serializers import (
	InterventionManagementAssignSerializer,
	InterventionManagementCreateSerializer,
	InterventionManagementResponseSerializer,
	InterventionWorkerCompleteSerializer,
	InterventionWorkerPhotoCreateSerializer,
	InterventionWorkerPhotoResponseSerializer,
)
from interventions.services import (
	InterventionAssignmentError,
	InterventionCreationError,
	InterventionWorkflowError,
	add_assigned_intervention_photo,
	assign_intervention,
	complete_assigned_intervention,
	create_intervention,
	get_assigned_intervention,
	list_assigned_interventions,
	start_assigned_intervention,
)


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")
InterventionWorkerPhotoUploadRequestSerializer = inline_serializer(
	name="InterventionWorkerPhotoUploadRequest",
	fields={
		"file": serializers.ImageField(required=True),
		"caption": serializers.CharField(required=False, allow_blank=True, default=""),
	},
)


class InterventionManagementCreateListView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InterventionManagementCreateSerializer

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Intervention.objects.none()

		return Intervention.objects.select_related(
			"vehicle",
			"vehicle__brand",
			"reservation",
			"assigned_to",
			"assigned_to__role",
			"created_by",
			"created_by__role",
		).order_by("-created_at", "-id")

	@extend_schema(
		tags=["Management Interventions"],
		responses={
			201: InterventionManagementResponseSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		try:
			intervention = create_intervention(
				vehicle_id=serializer.validated_data["vehicle_id"],
				reservation_id=serializer.validated_data.get("reservation_id"),
				intervention_type=serializer.validated_data["intervention_type"],
				description=serializer.validated_data.get("description", ""),
				created_by=request.user,
			)
		except InterventionCreationError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)

		response_serializer = InterventionManagementResponseSerializer(intervention, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)

	@extend_schema(
		tags=["Management Interventions"],
		responses={
			200: InterventionManagementResponseSerializer(many=True),
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		queryset = self.get_queryset()
		response_serializer = InterventionManagementResponseSerializer(queryset, many=True, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class InterventionManagementAssignView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InterventionManagementAssignSerializer
	lookup_field = "id"
	lookup_url_kwarg = "id"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Intervention.objects.none()

		return Intervention.objects.select_related(
			"vehicle",
			"vehicle__brand",
			"reservation",
			"assigned_to",
			"assigned_to__role",
			"created_by",
			"created_by__role",
		)

	@extend_schema(
		tags=["Management Interventions"],
		request=InterventionManagementAssignSerializer,
		responses={
			200: InterventionManagementResponseSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def patch(self, request, *args, **kwargs):
		intervention = self.get_object()

		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		try:
			updated_intervention = assign_intervention(
				intervention=intervention,
				assigned_user_id=serializer.validated_data["assigned_user_id"],
				manager=request.user,
			)
		except InterventionAssignmentError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)

		response_serializer = InterventionManagementResponseSerializer(updated_intervention, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerBaseView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated]
	lookup_field = "id"
	lookup_url_kwarg = "id"
	intervention_type = None

	def _resolve_intervention(self):
		return get_assigned_intervention(
			user=self.request.user,
			intervention_type=self.intervention_type,
			intervention_id=self.kwargs[self.lookup_url_kwarg],
		)

	def _map_workflow_error_status(self, exc):
		return getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST) or status.HTTP_400_BAD_REQUEST


class _InterventionWorkerListView(_InterventionWorkerBaseView):
	serializer_class = InterventionManagementResponseSerializer

	@extend_schema(
		tags=["Interventions"],
		responses={
			200: InterventionManagementResponseSerializer(many=True),
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		queryset = list_assigned_interventions(user=request.user, intervention_type=self.intervention_type)
		response_serializer = InterventionManagementResponseSerializer(queryset, many=True, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerDetailView(_InterventionWorkerBaseView):
	serializer_class = InterventionManagementResponseSerializer

	@extend_schema(
		tags=["Interventions"],
		responses={
			200: InterventionManagementResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		try:
			intervention = self._resolve_intervention()
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(intervention, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerStartView(_InterventionWorkerBaseView):
	serializer_class = InterventionManagementResponseSerializer

	@extend_schema(
		tags=["Interventions"],
		responses={
			200: InterventionManagementResponseSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
			409: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		try:
			intervention = self._resolve_intervention()
			updated = start_assigned_intervention(intervention=intervention)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(updated, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerPhotoCreateView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerPhotoCreateSerializer
	parser_classes = [MultiPartParser, FormParser]

	@extend_schema(
		tags=["Interventions"],
		request={"multipart/form-data": InterventionWorkerPhotoUploadRequestSerializer},
		responses={
			201: InterventionWorkerPhotoResponseSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
			409: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		try:
			intervention = self._resolve_intervention()
			photo = add_assigned_intervention_photo(
				intervention=intervention,
				uploaded_file=serializer.validated_data["file"],
				caption=serializer.validated_data.get("caption", ""),
			)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionWorkerPhotoResponseSerializer(photo, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class _InterventionWorkerCompleteView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerCompleteSerializer

	@extend_schema(
		tags=["Interventions"],
		request=InterventionWorkerCompleteSerializer,
		responses={
			200: InterventionManagementResponseSerializer,
			400: ErrorDetailResponseSerializer,
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
			409: ErrorDetailResponseSerializer,
		},
	)
	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		try:
			intervention = self._resolve_intervention()
			updated = complete_assigned_intervention(
				intervention=intervention,
				report=serializer.validated_data.get("report", ""),
			)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(updated, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class MechanicInterventionListView(_InterventionWorkerListView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionDetailView(_InterventionWorkerDetailView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionStartView(_InterventionWorkerStartView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionPhotoCreateView(_InterventionWorkerPhotoCreateView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionCompleteView(_InterventionWorkerCompleteView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class CleaningInterventionListView(_InterventionWorkerListView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionDetailView(_InterventionWorkerDetailView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionStartView(_InterventionWorkerStartView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionPhotoCreateView(_InterventionWorkerPhotoCreateView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionCompleteView(_InterventionWorkerCompleteView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE
