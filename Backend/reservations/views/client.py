from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers

from accounts.models import ClientProfile
from accounts.permissions import IsClient, IsReservationOwner
from interventions.services.vehicle_access import (
    VehicleAccessError,
    lock_and_revoke_after_return,
    lock_vehicle,
    unlock_vehicle,
)
from payments.services import (
    DepositAuthorizationError,
    PaymentIntentError,
    authorize_deposit,
    create_or_reuse_payment_intent,
)
from reservations.models import Reservation
from reservations.serializers.reservation import (
    ReservationCancelRequestSerializer,
    ReservationCancelResponseSerializer,
    ReservationCreateRequestSerializer,
    ReservationCreateResponseSerializer,
    ReservationDepositRequestSerializer,
    ReservationDepositResponseSerializer,
    ReservationListDetailSerializer,
    ReservationPaymentIntentRequestSerializer,
    ReservationPaymentIntentResponseSerializer,
)
from reservations.services import ReservationCreationError, create_draft_reservation
from reservations.services.cancellation import CancellationError, cancel_reservation
from vehicles.models import Vehicle


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class VehicleAccessActionResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)
    timestamp = serializers.DateTimeField(read_only=True)


class VehicleAccessActionRequestSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            keys = sorted(data.keys())
            if keys:
                raise serializers.ValidationError(
                    {field: ["Ce champ n'est pas autorise."] for field in keys}
                )
        return {}


def _client_request_context(request):
    meta = getattr(request, "META", {}) or {}
    forwarded_for = meta.get("HTTP_X_FORWARDED_FOR")
    ip_address = None

    if isinstance(forwarded_for, str) and forwarded_for.strip():
        ip_address = forwarded_for.split(",")[0].strip() or None
    if ip_address is None:
        remote_addr = meta.get("REMOTE_ADDR")
        if isinstance(remote_addr, str):
            ip_address = remote_addr.strip() or None

    user_agent = request.headers.get("User-Agent") if hasattr(request, "headers") else None
    if isinstance(user_agent, str):
        user_agent = user_agent.strip()[:512] or None
    else:
        user_agent = None

    return {
        "ip_address": ip_address,
        "user_agent": user_agent,
    }


def _reservation_access_error_response(exc: VehicleAccessError):
    detail = {"code": exc.code, "message": exc.message}
    status_code = exc.http_status or status.HTTP_400_BAD_REQUEST

    if exc.code == "NOT_OWNER":
        status_code = status.HTTP_404_NOT_FOUND

    return Response(detail, status=status_code)


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


class ReservationClientDepositAuthorizeView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
    serializer_class = ReservationDepositRequestSerializer
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
        tags=["Reservations"],
        description=(
            "Preautorise la caution d'une reservation via SIMULATED ou STRIPE_TEST. "
            "Le montant est toujours calcule cote backend. "
            "Attention: une preautorisation Stripe expire automatiquement."
        ),
        request=ReservationDepositRequestSerializer,
        responses={
            200: ReservationDepositResponseSerializer,
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

        mode = serializer.validated_data["mode"]

        try:
            result = authorize_deposit(
                reservation=reservation,
                requested_by=request.user,
                mode=mode,
            )
        except DepositAuthorizationError as exc:
            detail = {"code": exc.code, "message": exc.message}
            if exc.details:
                detail["details"] = exc.details
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

        deposit = result["deposit"]
        updated_reservation = result["reservation"]
        response_data = {
            "message": "Caution preautorisee.",
            "reservation": ReservationListDetailSerializer(updated_reservation).data,
            "deposit_id": deposit.id,
            "deposit_mode": deposit.mode,
            "deposit_status": deposit.status,
            "deposit_amount": deposit.amount,
            "currency": deposit.currency,
            "stripe_payment_intent_id": deposit.stripe_payment_intent_id,
            "authorization_expires_at": deposit.authorization_expires_at,
            "authorized_at": deposit.authorized_at,
            "client_secret": result["client_secret"],
            "authorization_note": result["authorization_note"],
        }

        response_serializer = ReservationDepositResponseSerializer(response_data)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ReservationClientPaymentIntentView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsClient, IsReservationOwner]
    serializer_class = ReservationPaymentIntentRequestSerializer
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
        tags=["Reservations"],
        description=(
            "Cree ou reutilise un PaymentIntent Stripe pour payer la location. "
            "Le montant est toujours recalcule cote backend et la caution doit etre AUTORISEE."
        ),
        request=ReservationPaymentIntentRequestSerializer,
        responses={
            200: ReservationPaymentIntentResponseSerializer,
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

        try:
            result = create_or_reuse_payment_intent(
                reservation=reservation,
                requested_by=request.user,
            )
        except PaymentIntentError as exc:
            detail = {"code": exc.code, "message": exc.message}
            if exc.details:
                detail["details"] = exc.details
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = ReservationPaymentIntentResponseSerializer(result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ReservationUnlockView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsClient]
    serializer_class = VehicleAccessActionRequestSerializer
    lookup_field = "id"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return Reservation.objects.select_related("client", "client__user", "vehicle")

    def get_object(self):
        queryset = self.get_queryset()
        return get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])

    @extend_schema(
        tags=["Vehicle Access"],
        description=(
            "Simulation logicielle de deverrouillage. Aucun dispositif physique n'est contacte. "
            "L'acces depend de la reservation et de l'etat des lieux initial. Toutes les tentatives authentifiees "
            "sont journalisees cote backend."
        ),
        request=VehicleAccessActionRequestSerializer,
        responses={
            200: VehicleAccessActionResponseSerializer,
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

        reservation = self.get_object()

        try:
            result = unlock_vehicle(
                reservation=reservation,
                requested_by=request.user,
                request_context=_client_request_context(request),
            )
        except VehicleAccessError as exc:
            return _reservation_access_error_response(exc)

        return Response(
            {
                "message": "Véhicule déverrouillé.",
                "state": result["state"],
                "timestamp": result["unlocked_at"],
            },
            status=status.HTTP_200_OK,
        )


class ReservationLockView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsClient]
    serializer_class = VehicleAccessActionRequestSerializer
    lookup_field = "id"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return Reservation.objects.select_related("client", "client__user", "vehicle")

    def get_object(self):
        queryset = self.get_queryset()
        return get_object_or_404(queryset, pk=self.kwargs[self.lookup_url_kwarg])

    @extend_schema(
        tags=["Vehicle Access"],
        description=(
            "Simulation logicielle de verrouillage. Aucun dispositif physique n'est contacte. "
            "L'acces depend de la reservation et de l'etat des lieux initial. Toutes les tentatives authentifiees "
            "sont journalisees cote backend."
        ),
        request=VehicleAccessActionRequestSerializer,
        responses={
            200: VehicleAccessActionResponseSerializer,
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

        reservation = self.get_object()
        reservation.refresh_from_db(fields=["status"])

        try:
            if reservation.status == Reservation.Status.A_CONTROLER:
                result = lock_and_revoke_after_return(
                    reservation=reservation,
                    requested_by=request.user,
                    request_context=_client_request_context(request),
                )
            else:
                result = lock_vehicle(
                    reservation=reservation,
                    requested_by=request.user,
                    request_context=_client_request_context(request),
                )
        except VehicleAccessError as exc:
            return _reservation_access_error_response(exc)

        return Response(
            {
                "message": "Véhicule verrouillé.",
                "state": result["state"],
                "timestamp": result["locked_at"],
            },
            status=status.HTTP_200_OK,
        )
