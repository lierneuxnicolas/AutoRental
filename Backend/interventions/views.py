from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsManagerOrAdministrator
from interventions.models import Intervention
from interventions.serializers import (
	InterventionManagementAssignSerializer,
	InterventionManagementCreateSerializer,
	InterventionManagementResponseSerializer,
)
from interventions.services import (
	InterventionAssignmentError,
	InterventionCreationError,
	assign_intervention,
	create_intervention,
)


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


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
