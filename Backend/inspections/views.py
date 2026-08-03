from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsClient, IsReservationOwner
from inspections.models import Inspection
from inspections.services.departure import (
	MANDATORY_PHOTO_TYPES,
	MISSING_FIELDS,
	DepartureInspectionError,
	create_departure_inspection,
)
from reservations.models import Reservation


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


class DepartureInspectionCreateView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
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
			"inspection": InspectionSummarySerializer(inspection).data,
			"mandatory_photo_types": MANDATORY_PHOTO_TYPES,
			"missing_fields": MISSING_FIELDS,
		}
		return Response(DepartureInspectionResponseSerializer(response_data).data, status=status.HTTP_200_OK)
