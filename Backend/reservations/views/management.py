"""
Point 39F: Consultation des réservations par le gestionnaire-comptable et l'administrateur.

Endpoints:
- GET /api/v1/management/reservations/
- GET /api/v1/management/reservations/{id}/

Permissions:
- IsAuthenticated
- IsManagerOrAdministrator

Exclut:
- Clients
- Mécaniciens
- Nettoyeurs
- Anonymes

Note sur les mécaniciens et nettoyeurs:
Les informations utiles leur seront exposées uniquement via:
- Leurs interventions attribuées
- Un serializer limité
Aucun endpoint général n'est créé pour eux.
"""

from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsManagerOrAdministrator
from reservations.models import Reservation
from reservations.serializers.management import (
    ReservationManagementDetailSerializer,
    ReservationManagementCompleteRequestSerializer,
    ReservationManagementCompleteResponseSerializer,
    ReservationManagementListSerializer,
)
from reservations.services import ReservationCompletionError, complete_reservation


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class ReservationManagementPagination(PageNumberPagination):
    """Pagination dédiée au management pour exposer proprement page_size."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ==============================================================================
# Filtres personnalisés pour la liste management
# ==============================================================================


class ReservationManagementFilterSet(filters.FilterSet):
    """
    Filtres pour la consultation des réservations par le management.

    Supported filters:
    - status: statut de la réservation
    - vehicle: ID du véhicule
    - client: ID du client
    - start_at_from: début de période (>=)
    - start_at_to: début de période (<=)
    - end_at_from: fin de période (>=)
    - end_at_to: fin de période (<=)
    - reference: recherche par référence (icontains)
    - client_email: recherche par email du client (icontains)
    - client_first_name: recherche par prénom du client (icontains)
    - client_last_name: recherche par nom du client (icontains)
    - vehicle_registration_plate: recherche par immatriculation (icontains)
    """

    # Filtres exacts
    status = filters.CharFilter(field_name="status", lookup_expr="exact")
    vehicle = filters.NumberFilter(field_name="vehicle_id", lookup_expr="exact")
    client = filters.NumberFilter(field_name="client_id", lookup_expr="exact")
    start_at = filters.DateTimeFilter(field_name="start_at", lookup_expr="exact")
    end_at = filters.DateTimeFilter(field_name="end_at", lookup_expr="exact")

    # Filtres de période
    start_at_from = filters.DateTimeFilter(field_name="start_at", lookup_expr="gte")
    start_at_to = filters.DateTimeFilter(field_name="start_at", lookup_expr="lte")
    end_at_from = filters.DateTimeFilter(field_name="end_at", lookup_expr="gte")
    end_at_to = filters.DateTimeFilter(field_name="end_at", lookup_expr="lte")

    # Recherche texte
    reference = filters.CharFilter(field_name="reference", lookup_expr="icontains")
    client_email = filters.CharFilter(field_name="client__user__email", lookup_expr="icontains")
    client_first_name = filters.CharFilter(field_name="client__user__first_name", lookup_expr="icontains")
    client_last_name = filters.CharFilter(field_name="client__user__last_name", lookup_expr="icontains")
    vehicle_registration_plate = filters.CharFilter(field_name="vehicle__registration_number", lookup_expr="icontains")

    class Meta:
        model = Reservation
        fields = []  # Tous les filtres sont définis ci-dessus


# ==============================================================================
# Vue de liste des réservations pour le management
# ==============================================================================


class ReservationManagementListView(generics.ListAPIView):
    """
    Liste toutes les réservations avec filtres et recherche.

    Permissions:
    - IsAuthenticated: l'utilisateur doit être connecté
    - IsManagerOrAdministrator: rôle GESTIONNAIRE_COMPTABLE ou ADMINISTRATEUR

    Filtres supportés:
    - status: Filtrer par statut de réservation
    - vehicle: Filtrer par ID du véhicule
    - client: Filtrer par ID du client
    - start_at / end_at: Filtrer par date exacte de début/fin de réservation
    - start_at_from/start_at_to: Filtrer par date de début de réservation
    - end_at_from/end_at_to: Filtrer par date de fin de réservation

    Recherche supportée:
    - search: Recherche globale sur référence, email, prénom, nom, immatriculation
    - reference/client_email/client_first_name/client_last_name/vehicle_registration_plate: recherche ciblée (contient)

    Ordering supporté:
    - created_at, -created_at
    - start_at, -start_at
    - rental_amount, -rental_amount

    Pagination:
    - Page size: 20 (par défaut, peut être ajusté)

    Sécurité des données:
    - Aucun mot de passe exposé
    - Aucun numéro complet de document d'identité
    - Aucun fichier de document
    - Aucune donnée bancaire
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
    serializer_class = ReservationManagementListSerializer
    pagination_class = ReservationManagementPagination
    filterset_class = ReservationManagementFilterSet
    search_fields = [
        "reference",
        "client__user__email",
        "client__user__first_name",
        "client__user__last_name",
        "vehicle__registration_number",
    ]
    ordering_fields = ["created_at", "start_at", "rental_amount"]
    ordering = ["-created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return Reservation.objects.select_related(
            "client",
            "client__user",
            "vehicle",
            "vehicle__brand",
            "vehicle__category",
        ).order_by(*self.ordering)

    @extend_schema(
        tags=["Reservation Management"],
        description=(
            "Liste paginée de toutes les réservations pour le gestionnaire-comptable et l'administrateur. "
            "Accès refusé aux clients, mécaniciens, nettoyeurs et utilisateurs anonymes. "
            "Les mécaniciens/nettoyeurs consomment uniquement les données nécessaires via leurs interventions attribuées "
            "et un serializer limité."
        ),
        parameters=[
            OpenApiParameter(
                name="status",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par statut de réservation (exact match).",
            ),
            OpenApiParameter(
                name="vehicle",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par ID du véhicule.",
            ),
            OpenApiParameter(
                name="client",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par ID du client.",
            ),
            OpenApiParameter(
                name="start_at",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de début exacte. Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="end_at",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de fin exacte. Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="start_at_from",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de début (>=). Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="start_at_to",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de début (<=). Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="end_at_from",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de fin (>=). Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="end_at_to",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Filtrer par date de fin (<=). Format: ISO 8601 datetime.",
            ),
            OpenApiParameter(
                name="search",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Recherche globale (référence, email client, prénom, nom, immatriculation).",
            ),
            OpenApiParameter(
                name="reference",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Rechercher par référence (contient).",
            ),
            OpenApiParameter(
                name="client_email",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Rechercher par email du client (contient).",
            ),
            OpenApiParameter(
                name="client_first_name",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Rechercher par prénom du client (contient).",
            ),
            OpenApiParameter(
                name="client_last_name",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Rechercher par nom du client (contient).",
            ),
            OpenApiParameter(
                name="vehicle_registration_plate",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Rechercher par immatriculation du véhicule (contient).",
            ),
            OpenApiParameter(
                name="ordering",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Tri autorisé: created_at, -created_at, start_at, -start_at, rental_amount, -rental_amount.",
            ),
            OpenApiParameter(
                name="page",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Numéro de page (pagination).",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Nombre d'éléments par page.",
            ),
        ],
        responses={
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


# ==============================================================================
# Vue de détail d'une réservation pour le management
# ==============================================================================


class ReservationManagementDetailView(generics.RetrieveAPIView):
    """
    Consulte les détails complets d'une réservation.

    Permissions:
    - IsAuthenticated: l'utilisateur doit être connecté
    - IsManagerOrAdministrator: rôle GESTIONNAIRE_COMPTABLE ou ADMINISTRATEUR

    Retourne:
    - Informations de réservation complètes
    - Résumé du client (email, nom, prénom, statut du profil)
    - Résumé du véhicule (marque, modèle, immatriculation, etc.)
    - Dates de confirmation/annulation
    - Motif d'annulation (si applicable)
    - Montants (location, caution)

    Sécurité des données:
    - Aucun mot de passe exposé
    - Aucun numéro complet de document d'identité
    - Aucun fichier de document
    - Aucune donnée bancaire
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
    serializer_class = ReservationManagementDetailSerializer
    lookup_field = "id"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return Reservation.objects.select_related(
            "client",
            "client__user",
            "vehicle",
            "vehicle__brand",
            "vehicle__category",
        )

    @extend_schema(
        tags=["Reservation Management"],
        description=(
            "Récupère les détails d'une réservation pour le gestionnaire-comptable et l'administrateur. "
            "Aucun mot de passe, document d'identité complet, fichier de document ou donnée bancaire n'est exposé. "
            "Accès refusé aux clients, mécaniciens, nettoyeurs et anonymes."
        ),
        responses={
            200: ReservationManagementDetailSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
        },
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class ReservationManagementCompleteView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
    serializer_class = ReservationManagementCompleteRequestSerializer
    lookup_field = "id"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Reservation.objects.none()

        return Reservation.objects.select_related(
            "client",
            "client__user",
            "vehicle",
            "vehicle__brand",
            "vehicle__category",
        )

    @extend_schema(
        tags=["Reservation Management"],
        request=ReservationManagementCompleteRequestSerializer,
        description=(
            "Cloture une reservation après les vérifications finales. "
            "La reservation doit être en A_CONTROLER et le véhicule en DISPONIBLE."
        ),
        responses={
            200: ReservationManagementCompleteResponseSerializer,
            400: ErrorDetailResponseSerializer,
            401: ErrorDetailResponseSerializer,
            403: ErrorDetailResponseSerializer,
            404: ErrorDetailResponseSerializer,
            409: ErrorDetailResponseSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        reservation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            completed_reservation = complete_reservation(reservation=reservation, requested_by=request.user)
        except ReservationCompletionError as exc:
            detail = {"code": exc.code, "message": exc.message}
            return Response(detail, status=exc.http_status)

        response_serializer = ReservationManagementCompleteResponseSerializer(
            {"message": "Reservation terminee.", "reservation": completed_reservation}
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)
