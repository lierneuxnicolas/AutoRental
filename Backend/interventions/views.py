from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, status
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role, User
from accounts.permissions import IsCleaner, IsManagerOrAdministrator, IsMechanic
from common.models import SystemLog
from common.services import create_system_log
from interventions.models import Intervention
from interventions.serializers import (
	InterventionManagementAssignSerializer,
	InterventionAssignableUserSerializer,
	InterventionManagementCreateSerializer,
	InterventionManagementPlanSerializer,
	InterventionDecisionSerializer,
	InterventionManagementResponseSerializer,
	InterventionWorkerCheckInSerializer,
	InterventionWorkerCheckOutSerializer,
	InterventionWorkerCompleteSerializer,
	InterventionWorkerInterruptSerializer,
	InterventionWorkerPhotoCreateSerializer,
	InterventionWorkerPhotoResponseSerializer,
	InterventionWorkerWorkSerializer,
)
from interventions.services import (
	InterventionAssignmentError,
	InterventionCreationError,
	InterventionWorkflowError,
	InterventionPlanningError,
	add_assigned_intervention_photo,
	assign_intervention,
	check_in_assigned_intervention,
	check_out_assigned_intervention,
	complete_assigned_intervention,
	create_intervention,
	get_assigned_intervention,
	interrupt_assigned_intervention,
	list_assigned_interventions,
	plan_intervention,
	InterventionDecisionError,
	decide_intervention,
	save_assigned_intervention_work,
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
InterventionWorkerCheckInRequestSerializer = inline_serializer(
	name="InterventionWorkerCheckInRequest",
	fields={
		"mileage": serializers.IntegerField(required=True, min_value=0),
		"observations": serializers.CharField(required=True, allow_blank=False),
		"vehicle_condition": serializers.CharField(required=False, allow_blank=True),
		"cleanliness_state": serializers.CharField(required=False, allow_blank=True),
		"cleanliness_notes": serializers.CharField(required=False, allow_blank=True),
		"photos": serializers.ListField(child=serializers.ImageField(), required=False),
	},
)


def _extract_request_ip(request) -> str | None:
	forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
	if forwarded_for:
		return forwarded_for.split(",")[0].strip()

	return request.META.get("REMOTE_ADDR")


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

		create_system_log(
			user=request.user,
			action="INTERVENTION_CREATED",
			message=(
				f"Intervention {intervention.reference} (id={intervention.id}) "
				f"type={intervention.intervention_type} "
				f"vehicle={intervention.vehicle.registration_number} created."
			),
			level=SystemLog.Level.INFO,
			ip_address=_extract_request_ip(request),
		)

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


class InterventionManagementPlanView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InterventionManagementPlanSerializer

	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		try:
			intervention = plan_intervention(
				vehicle_id=serializer.validated_data["vehicle_id"],
				intervention_type=serializer.validated_data["intervention_type"],
				assigned_user_id=serializer.validated_data["assigned_user_id"],
				planned_start_at=serializer.validated_data["planned_start_at"],
				planned_end_at=serializer.validated_data["planned_end_at"],
				description=serializer.validated_data["description"],
				manager=request.user,
			)
		except InterventionPlanningError as error:
			payload = {"code": error.code, "detail": error.message}
			if error.conflict_reservation is not None:
				reservation = error.conflict_reservation
				payload["reservation"] = {
					"id": reservation.id,
					"reference": reservation.reference,
					"client": f"{reservation.client.user.last_name} {reservation.client.user.first_name}".strip(),
					"start_at": reservation.start_at,
					"end_at": reservation.end_at,
				}
			if error.conflict_intervention is not None:
				payload["intervention"] = {
					"id": error.conflict_intervention.id,
					"reference": error.conflict_intervention.reference,
					"planned_start_at": error.conflict_intervention.planned_start_at,
					"planned_end_at": error.conflict_intervention.planned_end_at,
				}
			return Response(payload, status=status.HTTP_409_CONFLICT)

		return Response(
			InterventionManagementResponseSerializer(intervention, context={"request": request}).data,
			status=status.HTTP_201_CREATED,
		)

class InterventionManagementDecisionView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InterventionDecisionSerializer

	def post(self, request, id):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		data = serializer.validated_data
		planning = None
		if data["decision"] in {Intervention.Decision.PLAN_MAINTENANCE, Intervention.Decision.PLAN_CLEANING}:
			if not all(data.get(key) for key in ("assigned_user_id", "planned_start_at", "planned_end_at")):
				return Response({"detail": "Les informations de planification sont obligatoires."}, status=status.HTTP_400_BAD_REQUEST)
			planning = data
		try:
			intervention = decide_intervention(intervention_id=id, decision=data["decision"], manager=request.user, comment=data.get("comment", ""), planning=planning)
		except InterventionDecisionError as error:
			return Response({"code": error.code, "detail": error.message}, status=status.HTTP_409_CONFLICT)
		return Response(InterventionManagementResponseSerializer(intervention, context={"request": request}).data, status=status.HTTP_200_OK)


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

		assigned_user_label = (
			updated_intervention.assigned_to.email
			if updated_intervention.assigned_to is not None
			else f"id={serializer.validated_data['assigned_user_id']}"
		)
		create_system_log(
			user=request.user,
			action="INTERVENTION_ASSIGNED",
			message=(
				f"Intervention {updated_intervention.reference} (id={updated_intervention.id}) "
				f"assigned to {assigned_user_label}."
			),
			level=SystemLog.Level.INFO,
			ip_address=_extract_request_ip(request),
		)

		response_serializer = InterventionManagementResponseSerializer(updated_intervention, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class InterventionAssignableUserListView(generics.ListAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InterventionAssignableUserSerializer
	pagination_class = None

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return User.objects.none()

		return User.objects.select_related("role").filter(
			is_active=True,
			role__is_active=True,
			role__code__in=[Role.Code.MECANICIEN, Role.Code.NETTOYEUR],
		).order_by("role__code", "last_name", "first_name", "email")

	@extend_schema(
		tags=["Management Interventions"],
		responses={
			200: InterventionAssignableUserSerializer(many=True),
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


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


class _InterventionWorkerCheckInView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerCheckInSerializer
	parser_classes = [MultiPartParser, FormParser]

	@extend_schema(
		tags=["Interventions"],
		request={"multipart/form-data": InterventionWorkerCheckInRequestSerializer},
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
			updated = check_in_assigned_intervention(
				intervention=intervention,
				mileage=serializer.validated_data["mileage"],
				observations=serializer.validated_data["observations"],
				vehicle_condition=serializer.validated_data.get("vehicle_condition", ""),
				cleanliness_state=serializer.validated_data.get("cleanliness_state", ""),
				cleanliness_notes=serializer.validated_data.get("cleanliness_notes", ""),
				photos=request.FILES.getlist("photos"),
			)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(updated, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerInterruptView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerInterruptSerializer
	parser_classes = [MultiPartParser, FormParser]

	@extend_schema(tags=["Interventions"], request={"multipart/form-data": InterventionWorkerInterruptSerializer}, responses={200: InterventionManagementResponseSerializer})
	def post(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		try:
			intervention = self._resolve_intervention()
			updated = interrupt_assigned_intervention(
				intervention=intervention,
				reason_type=serializer.validated_data["reason_type"],
				reason_detail=serializer.validated_data.get("reason_detail", ""),
				photo=serializer.validated_data.get("photo"),
			)
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


class _InterventionWorkerWorkView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerWorkSerializer

	@extend_schema(
		tags=["Interventions"],
		request=InterventionWorkerWorkSerializer,
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
			updated = save_assigned_intervention_work(
				intervention=intervention,
				work_data=serializer.validated_data["work_data"],
				estimated_cost=serializer.validated_data.get("estimated_cost"),
			)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(updated, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


class _InterventionWorkerCheckOutView(_InterventionWorkerBaseView):
	serializer_class = InterventionWorkerCheckOutSerializer
	parser_classes = [MultiPartParser, FormParser]

	@extend_schema(
		tags=["Interventions"],
		request={"multipart/form-data": InterventionWorkerCheckOutSerializer},
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
			updated = check_out_assigned_intervention(
				intervention=intervention,
				final_mileage=serializer.validated_data["final_mileage"],
				final_vehicle_state=serializer.validated_data["final_vehicle_state"],
				conclusions=serializer.validated_data["conclusions"],
				vehicle_operational=serializer.validated_data.get("vehicle_operational"),
				vehicle_clean=serializer.validated_data.get("vehicle_clean"),
				new_intervention_needed=serializer.validated_data["new_intervention_needed"],
				final_comment=serializer.validated_data.get("final_comment", ""),
				photos=request.FILES.getlist("photos"),
			)
		except InterventionWorkflowError as exc:
			return Response({"code": exc.code, "detail": exc.message}, status=self._map_workflow_error_status(exc))

		response_serializer = InterventionManagementResponseSerializer(updated, context={"request": request})
		return Response(response_serializer.data, status=status.HTTP_200_OK)


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

		create_system_log(
			user=request.user,
			action="INTERVENTION_COMPLETED",
			message=(
				f"Intervention {updated.reference} (id={updated.id}) completed. "
				f"type={updated.intervention_type}."
			),
			level=SystemLog.Level.INFO,
			ip_address=_extract_request_ip(request),
		)

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


class MechanicInterventionCheckInView(_InterventionWorkerCheckInView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionInterruptView(_InterventionWorkerInterruptView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionPhotoCreateView(_InterventionWorkerPhotoCreateView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionWorkView(_InterventionWorkerWorkView):
	permission_classes = [IsAuthenticated, IsMechanic]
	intervention_type = Intervention.Type.MECANIQUE


class MechanicInterventionCheckOutView(_InterventionWorkerCheckOutView):
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


class CleaningInterventionCheckInView(_InterventionWorkerCheckInView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionInterruptView(_InterventionWorkerInterruptView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionPhotoCreateView(_InterventionWorkerPhotoCreateView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionWorkView(_InterventionWorkerWorkView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionCheckOutView(_InterventionWorkerCheckOutView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE


class CleaningInterventionCompleteView(_InterventionWorkerCompleteView):
	permission_classes = [IsAuthenticated, IsCleaner]
	intervention_type = Intervention.Type.NETTOYAGE
