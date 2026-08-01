from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import ClientProfile
from accounts.permissions import IsClient, IsReservationOwner
from reservations.models import Reservation
from reservations.serializers.reservation import (
    ReservationCancelRequestSerializer,
    ReservationCancelResponseSerializer,
    ReservationCreateRequestSerializer,
    ReservationCreateResponseSerializer,
    ReservationListDetailSerializer,
)
from reservations.services import ReservationCreationError, create_draft_reservation
from reservations.services.cancellation import CancellationError, cancel_reservation
from vehicles.models import Vehicle


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class ReservationClientListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsClient]
    filterset_fields = ["status"]
    filterset_class = None
    ordering_fields = ["created_at", "start_at"]
    ordering = ["-created_at", "start_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return (
            Reservation.objects.filter(client__user=self.request.user)
            .select_related("client", "client__user", "vehicle", "vehicle__brand", "vehicle__category")
            .order_by(*self.ordering)
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReservationCreateRequestSerializer
        return ReservationListDetailSerializer

    def _get_client_profile(self):
        profile = getattr(self.request.user, "client_profile", None)
        if profile is not None:
            return profile

        return get_object_or_404(ClientProfile.objects.select_related("user"), user=self.request.user)

    @extend_schema(
        tags=["Reservations"],
        description=(
            "Cree une reservation BROUILLON pour le client connecte. "
            "Le prix est recalcule cote Django et la disponibilite est reverifiee. "
            "Aucun paiement ni caution n'est cree a ce stade."
        ),
        request=ReservationCreateRequestSerializer,
        responses={
            201: ReservationCreateResponseSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = serializer.validated_data
        client_profile = self._get_client_profile()

        vehicle = Vehicle.objects.select_related("category", "brand").filter(pk=payload["vehicle_id"]).first()
        if vehicle is None:
            return Response(
                {"code": "VEHICLE_NOT_ACTIVE", "message": "Le vehicule demande est introuvable."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not vehicle.is_active:
            return Response(
                {"code": "VEHICLE_NOT_ACTIVE", "message": "Le vehicule demande est inactif."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reservation = create_draft_reservation(
                client=client_profile,
                vehicle=vehicle,
                start_at=payload["start_at"],
                end_at=payload["end_at"],
            )
        except ReservationCreationError as exc:
            detail = {"code": exc.code, "message": exc.message}
            if exc.details:
                detail["details"] = exc.details
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = ReservationCreateResponseSerializer(reservation)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Reservations"],
        parameters=[
            OpenApiParameter(
                name="status",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par statut de reservation.",
            ),
            OpenApiParameter(
                name="ordering",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Tri autorise: created_at, -created_at, start_at, -start_at.",
            ),
        ],
        responses={
            200: ReservationListDetailSerializer(many=True),
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ReservationClientDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
    serializer_class = ReservationListDetailSerializer
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

    @extend_schema(
        tags=["Reservations"],
        responses={
            200: ReservationListDetailSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


# ==============================================================================
# Point 39E: Annulation d'une réservation par son propriétaire
# ==============================================================================


class ReservationClientCancelView(generics.GenericAPIView):
    """
    Annule une réservation pour le client connecté.

    POST /api/v1/reservations/{id}/cancel/
    {
        "reason": "Raison de l'annulation"
    }

    Réponse:
    {
        "message": "Réservation annulée.",
        "reservation": {...}
    }

    Permissions:
    - IsAuthenticated: L'utilisateur doit être connecté
    - IsClient: L'utilisateur doit avoir le rôle CLIENT
    - IsReservationOwner: La réservation doit appartenir à l'utilisateur

    Statuts annulables (MVP):
    - BROUILLON
    - EN_ATTENTE_CAUTION
    - EN_ATTENTE_PAIEMENT
    - CONFIRMEE (uniquement si start_at > now())

    Non annulables:
    - EN_COURS, A_CONTROLER, TERMINEE, ANNULEE, PAIEMENT_ECHOUE
    """

    permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
    serializer_class = ReservationCancelRequestSerializer
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
        """Récupère l'objet Reservation avec les permissions."""
        queryset = self.get_queryset()
        reservation = get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])
        self.check_object_permissions(self.request, reservation)
        return reservation

    @extend_schema(
        tags=["Reservations"],
        description="Annule une réservation pour le client connecté.",
        request=ReservationCancelRequestSerializer,
        responses={
            200: ReservationCancelResponseSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        reservation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]

        try:
            cancelled_reservation = cancel_reservation(
                reservation=reservation,
                requested_by=request.user,
                reason=reason,
            )
        except CancellationError as exc:
            detail = {"code": exc.code, "message": exc.message}
            if exc.details:
                detail["details"] = exc.details
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

        response_data = {
            "message": "Réservation annulée.",
            "reservation": ReservationListDetailSerializer(cancelled_reservation).data,
        }
        return Response(response_data, status=status.HTTP_200_OK)
