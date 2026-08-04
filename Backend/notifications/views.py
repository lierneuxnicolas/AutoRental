from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from notifications.services import mark_all_notifications_as_read, mark_notification_as_read


UnreadCountResponseSerializer = inline_serializer(
	name="NotificationUnreadCountResponse",
	fields={"unread_count": serializers.IntegerField(min_value=0)},
)

NotificationReadResponseSerializer = inline_serializer(
	name="NotificationReadResponse",
	fields={
		"message": serializers.CharField(),
		"notification": NotificationSerializer(),
	},
)

NotificationReadAllResponseSerializer = inline_serializer(
	name="NotificationReadAllResponse",
	fields={
		"message": serializers.CharField(),
		"updated_count": serializers.IntegerField(min_value=0),
	},
)

ErrorResponseSerializer = inline_serializer(
	name="NotificationErrorResponse",
	fields={"detail": serializers.CharField()},
)


class NotificationListView(generics.ListAPIView):
	permission_classes = [IsAuthenticated]
	serializer_class = NotificationSerializer
	filter_backends = [DjangoFilterBackend, OrderingFilter]
	filterset_fields = ["is_read", "notification_type"]
	ordering_fields = ["created_at"]
	ordering = ["-created_at"]

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Notification.objects.none()

		queryset = Notification.objects.filter(user=self.request.user)

		created_at_after = self.request.query_params.get("created_at_after")
		if created_at_after:
			queryset = queryset.filter(created_at__gte=created_at_after)

		created_at_before = self.request.query_params.get("created_at_before")
		if created_at_before:
			queryset = queryset.filter(created_at__lte=created_at_before)

		return queryset

	@extend_schema(
		tags=["Notifications"],
		description=(
			"Liste paginee des notifications de l'utilisateur authentifie uniquement. "
			"Filtres supportes: is_read, notification_type, created_at_after, created_at_before."
		),
		parameters=[
			OpenApiParameter(
				name="is_read",
				type=bool,
				location=OpenApiParameter.QUERY,
				required=False,
				description="Filtrer par etat de lecture.",
			),
			OpenApiParameter(
				name="notification_type",
				type=str,
				location=OpenApiParameter.QUERY,
				required=False,
				description="Filtrer par type de notification.",
			),
			OpenApiParameter(
				name="ordering",
				type=str,
				location=OpenApiParameter.QUERY,
				required=False,
				description="Tri sur created_at: created_at ou -created_at.",
			),
			OpenApiParameter(
				name="created_at_after",
				type=str,
				location=OpenApiParameter.QUERY,
				required=False,
				description="Date/heure ISO8601 minimum (inclusive) sur created_at.",
			),
			OpenApiParameter(
				name="created_at_before",
				type=str,
				location=OpenApiParameter.QUERY,
				required=False,
				description="Date/heure ISO8601 maximum (inclusive) sur created_at.",
			),
		],
		responses={
			200: NotificationSerializer(many=True),
			401: OpenApiResponse(response=ErrorResponseSerializer),
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class NotificationUnreadCountView(APIView):
	permission_classes = [IsAuthenticated]

	@extend_schema(
		tags=["Notifications"],
		description="Retourne le nombre de notifications non lues de l'utilisateur authentifie.",
		responses={
			200: UnreadCountResponseSerializer,
			401: OpenApiResponse(response=ErrorResponseSerializer),
		},
	)
	def get(self, request, *args, **kwargs):
		unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
		return Response({"unread_count": unread_count}, status=status.HTTP_200_OK)


class NotificationMarkReadView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated]
	serializer_class = NotificationSerializer
	lookup_field = "pk"

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Notification.objects.none()

		return Notification.objects.filter(user=self.request.user)

	@extend_schema(
		tags=["Notifications"],
		description=(
			"Marque une notification personnelle comme lue. "
			"Si elle est deja lue, l'action reste idempotente."
		),
		request=None,
		responses={
			200: NotificationReadResponseSerializer,
			401: OpenApiResponse(response=ErrorResponseSerializer),
			404: OpenApiResponse(response=ErrorResponseSerializer),
		},
	)
	def post(self, request, *args, **kwargs):
		notification = self.get_object()
		notification = mark_notification_as_read(notification=notification, user=request.user)
		response_data = {
			"message": "Notification marquée comme lue.",
			"notification": NotificationSerializer(notification).data,
		}
		return Response(response_data, status=status.HTTP_200_OK)


class NotificationMarkAllReadView(APIView):
	permission_classes = [IsAuthenticated]

	@extend_schema(
		tags=["Notifications"],
		description="Marque toutes les notifications personnelles non lues comme lues.",
		request=None,
		responses={
			200: NotificationReadAllResponseSerializer,
			401: OpenApiResponse(response=ErrorResponseSerializer),
		},
	)
	def post(self, request, *args, **kwargs):
		updated_count = mark_all_notifications_as_read(user=request.user)
		return Response(
			{
				"message": "Toutes les notifications ont été marquées comme lues.",
				"updated_count": updated_count,
			},
			status=status.HTTP_200_OK,
		)
