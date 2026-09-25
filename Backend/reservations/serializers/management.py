"""
Serializers pour le management des réservations (point 39F).

Accessibles uniquement par:
- IsManagerOrAdministrator (gestionnaire-comptable, administrateur)

Données volontairement masquées pour la sécurité:
- Aucun mot de passe
- Aucun numéro complet de document d'identité
- Aucun fichier de document
- Aucune donnée bancaire
"""

from rest_framework import serializers

from django.db.models import Prefetch

from accounts.models import ClientProfile
from inspections.models import Damage, Inspection
from inspections.serializers import InspectionDamageReadSerializer, InspectionPhotoReadSerializer
from interventions.models import Intervention
from interventions.serializers import InterventionManagementResponseSerializer
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.serializers.public import VehiclePhotoPublicSerializer


REVIEW_TRIGGER_SEVERITIES = {Damage.Severity.ACCEPTABLE, Damage.Severity.GRAVE}


def _reservation_needs_review(obj) -> bool:
    """Return True when the check-in (departure) inspection reported an ACCEPTABLE or GRAVE anomaly.

    This is a display-only indicator for the manager list/detail views: it does not
    replace the reservation's real business status (obj.status). A manager decision
    (see reservations.services.review) sets review_resolved_at, which clears this flag
    without touching the underlying Damage/Inspection history.
    """

    if obj.review_resolved_at is not None:
        return False

    inspections = getattr(obj, "prefetched_inspections", None)
    if inspections is None:
        inspections = obj.inspections.filter(inspection_type=Inspection.Type.INITIAL).prefetch_related("damages")

    for inspection in inspections:
        if inspection.inspection_type != Inspection.Type.INITIAL:
            continue
        for damage in inspection.damages.all():
            if damage.severity in REVIEW_TRIGGER_SEVERITIES:
                return True

    return False


# ==============================================================================
# Client résumé pour le management (données limitées)
# ==============================================================================


class ReservationManagementClientSummarySerializer(serializers.Serializer):
    """Client résumé pour le management - données limitées."""

    id = serializers.IntegerField(source="client.id", read_only=True)
    first_name = serializers.CharField(source="client.user.first_name", read_only=True)
    last_name = serializers.CharField(source="client.user.last_name", read_only=True)
    email = serializers.EmailField(source="client.user.email", read_only=True)
    phone = serializers.CharField(source="client.user.phone", read_only=True, allow_blank=True)
    profile_status = serializers.CharField(source="client.profile_status", read_only=True)
    date_of_birth = serializers.DateField(source="client.date_of_birth", read_only=True, allow_null=True)


# ==============================================================================
# Véhicule résumé pour le management
# ==============================================================================


class ReservationManagementVehicleSummarySerializer(serializers.Serializer):
    """Véhicule résumé pour le management."""

    id = serializers.IntegerField(read_only=True)
    brand = serializers.CharField(source="brand.name", read_only=True)
    model_name = serializers.CharField(read_only=True)
    category = serializers.CharField(source="category.name", read_only=True)
    year = serializers.IntegerField(read_only=True)
    color = serializers.CharField(read_only=True)
    registration_plate = serializers.CharField(source="registration_number", read_only=True)
    energy_type = serializers.CharField(read_only=True)
    transmission = serializers.CharField(read_only=True)
    seats = serializers.IntegerField(read_only=True)
    doors = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    parking_name = serializers.CharField(source="parking_space.parking.name", read_only=True)
    parking_space_number = serializers.CharField(source="parking_space.number", read_only=True)
    main_photo = serializers.SerializerMethodField()

    def get_main_photo(self, obj):
        photos = list(obj.photos.all())
        primary = next((photo for photo in photos if photo.is_primary), None)
        photo = primary or (photos[0] if photos else None)
        if photo is None:
            return None
        return VehiclePhotoPublicSerializer(photo, context=self.context).data


class ReservationManagementInspectionSerializer(serializers.ModelSerializer):
    photos = InspectionPhotoReadSerializer(many=True, read_only=True)
    damages = InspectionDamageReadSerializer(many=True, read_only=True)
    completed_by_name = serializers.SerializerMethodField()

    def get_completed_by_name(self, obj):
        if obj.completed_by is None:
            return None
        return obj.completed_by.get_full_name().strip() or None

    class Meta:
        model = Inspection
        fields = [
            "id",
            "inspection_type",
            "status",
            "mileage",
            "energy_level_percent",
            "general_condition",
            "comments",
            "has_critical_issue",
            "critical_issue_description",
            "started_at",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "created_at",
            "updated_at",
            "photos",
            "damages",
        ]


class ReservationManagementPreviousSerializer(serializers.ModelSerializer):
    """Etat resume de la reservation precedente du meme vehicule (comparaison manager).

    Reutilise ReservationManagementInspectionSerializer : aucune duplication des
    photos/dommages, seule une lecture des inspections deja existantes.
    """

    client_summary = ReservationManagementClientSummarySerializer(source="*", read_only=True)
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    departure_inspection = serializers.SerializerMethodField()
    return_inspection = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "client_summary",
            "start_at",
            "end_at",
            "status",
            "rental_amount",
            "deposit_amount",
            "departure_inspection",
            "return_inspection",
        ]

    def _get_inspection(self, obj, inspection_type):
        for inspection in obj.inspections.all():
            if inspection.inspection_type == inspection_type:
                return inspection
        return None

    def get_departure_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.INITIAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_return_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.FINAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data


# ==============================================================================
# Réservation en list/detail pour le management
# ==============================================================================


class ReservationManagementListSerializer(serializers.ModelSerializer):
    """Réservation en liste pour le management."""

    vehicle = ReservationManagementVehicleSummarySerializer(read_only=True)
    client_summary = ReservationManagementClientSummarySerializer(source="*", read_only=True)
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    needs_review = serializers.SerializerMethodField()

    def get_needs_review(self, obj):
        return _reservation_needs_review(obj)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "client_summary",
            "vehicle",
            "start_at",
            "end_at",
            "status",
            "rental_amount",
            "deposit_amount",
            "needs_review",
            "created_at",
            "confirmed_at",
            "cancelled_at",
        ]


class ReservationManagementDetailSerializer(serializers.ModelSerializer):
    """Réservation en détail pour le management."""

    vehicle = ReservationManagementVehicleSummarySerializer(read_only=True)
    client_summary = ReservationManagementClientSummarySerializer(source="*", read_only=True)
    deposit_status = serializers.SerializerMethodField()
    departure_inspection = serializers.SerializerMethodField()
    return_inspection = serializers.SerializerMethodField()
    interventions = serializers.SerializerMethodField()
    rental_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    deposit_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    needs_review = serializers.SerializerMethodField()
    previous_reservation = serializers.SerializerMethodField()
    vehicle_reference_inspection = serializers.SerializerMethodField()

    def get_needs_review(self, obj):
        return _reservation_needs_review(obj)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "reference",
            "client_summary",
            "vehicle",
            "start_at",
            "end_at",
            "status",
            "rental_amount",
            "deposit_amount",
            "deposit_status",
            "departure_inspection",
            "return_inspection",
            "interventions",
            "needs_review",
            "previous_reservation",
            "vehicle_reference_inspection",
            "created_at",
            "confirmed_at",
            "cancelled_at",
            "cancellation_reason",
        ]

    def _get_inspection(self, obj, inspection_type):
        inspections = getattr(obj, "prefetched_inspections", None)
        if inspections is None:
            inspections = list(
                obj.inspections.select_related("completed_by").prefetch_related(
                    "photos",
                    "damages",
                    "damages__evidence_photos",
                )
            )

        for inspection in inspections:
            if inspection.inspection_type == inspection_type:
                return inspection
        return None

    def get_deposit_status(self, obj):
        deposits = getattr(obj, "prefetched_deposits", None)
        if deposits is None:
            deposit = obj.deposits.order_by("-created_at", "-id").first()
        else:
            deposit = deposits[0] if deposits else None

        return getattr(deposit, "status", None)

    def get_departure_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.INITIAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_return_inspection(self, obj):
        inspection = self._get_inspection(obj, Inspection.Type.FINAL)
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_previous_reservation(self, obj):
        """Return the closest earlier reservation of the same vehicle, if any.

        Used by the manager detail page to compare the vehicle's previous
        check-in/check-out state with the current one. Read-only lookup: it
        does not alter any reservation/inspection data.
        """

        previous = (
            Reservation.objects.filter(vehicle_id=obj.vehicle_id, start_at__lt=obj.start_at)
            .exclude(pk=obj.pk)
            .select_related("client__user")
            .prefetch_related(
                Prefetch(
                    "inspections",
                    queryset=Inspection.objects.select_related("completed_by").prefetch_related(
                        "photos",
                        "damages",
                        "damages__evidence_photos",
                    ),
                )
            )
            .order_by("-start_at")
            .first()
        )
        if previous is None:
            return None
        return ReservationManagementPreviousSerializer(previous, context=self.context).data

    def get_vehicle_reference_inspection(self, obj):
        inspections = getattr(obj.vehicle, "prefetched_reference_inspections", None)
        if inspections is None:
            inspection = obj.vehicle.reference_inspections.filter(
                inspection_type=Inspection.Type.REFERENCE,
            ).first()
        else:
            inspection = next(
                (item for item in inspections if item.inspection_type == Inspection.Type.REFERENCE),
                None,
            )
        if inspection is None:
            return None
        return ReservationManagementInspectionSerializer(inspection, context=self.context).data

    def get_interventions(self, obj):
        interventions = getattr(obj, "prefetched_interventions", None)
        if interventions is None:
            interventions = list(
                obj.interventions.select_related(
                    "vehicle",
                    "vehicle__brand",
                    "reservation",
                    "assigned_to",
                    "assigned_to__role",
                    "created_by",
                    "created_by__role",
                )
            )
        return InterventionManagementResponseSerializer(interventions, many=True, context=self.context).data


class ReservationManagementCompleteRequestSerializer(serializers.Serializer):
    confirm_vehicle_available = serializers.BooleanField(required=False, default=True)


class ReservationManagementCompleteResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)


class ReservationManagementIssueRequestSerializer(serializers.Serializer):
    anomaly_type = serializers.ChoiceField(
        choices=[
            ("MECANIQUE", "Mecanique"),
            ("ACCIDENT", "Accident"),
            ("NETTOYAGE", "Nettoyage"),
            ("AUTRE", "Autre"),
        ]
    )
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    vehicle_status = serializers.ChoiceField(
        choices=[
            Vehicle.Status.MAINTENANCE,
            Vehicle.Status.ACCIDENTE,
            Vehicle.Status.NETTOYAGE,
            Vehicle.Status.A_CONTROLER,
            Vehicle.Status.INDISPONIBLE,
        ]
    )
    evidence_files = serializers.ListField(
        child=serializers.ImageField(),
        required=False,
        allow_empty=True,
    )


class ReservationManagementIssueResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)
    intervention = InterventionManagementResponseSerializer(read_only=True, allow_null=True)


# ==============================================================================
# Decision du gestionnaire suite a une anomalie signalee au check-in ("A verifier")
# ==============================================================================


class ReservationReviewDecisionRequestSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["PARK", "MAINTENANCE", "UNAVAILABLE"])


class ReservationReviewDecisionResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)
    intervention = InterventionManagementResponseSerializer(read_only=True, allow_null=True)


class ReservationDepositReleaseResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)
    deposit_status = serializers.CharField(read_only=True)


class ReservationReplacementVehicleSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    brand = serializers.CharField(source="brand.name", read_only=True)
    model_name = serializers.CharField(read_only=True)
    registration_number = serializers.CharField(read_only=True)
    category = serializers.CharField(source="category.name", read_only=True)
    category_daily_rate = serializers.DecimalField(source="category.daily_rate", max_digits=10, decimal_places=2, read_only=True)
    parking_name = serializers.CharField(source="parking_space.parking.name", read_only=True)
    parking_space_number = serializers.CharField(source="parking_space.number", read_only=True)
    main_photo = serializers.SerializerMethodField()

    def get_main_photo(self, obj):
        photos = list(obj.photos.all())
        primary = next((photo for photo in photos if photo.is_primary), None)
        photo = primary or (photos[0] if photos else None)
        if photo is None:
            return None
        return VehiclePhotoPublicSerializer(photo, context=self.context).data


class ReservationReassignRequestSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(min_value=1)


class ReservationReassignResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)


class ReservationUnavailableCancellationResponseSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)
    reservation = ReservationManagementDetailSerializer(read_only=True)
    refund_initiated = serializers.BooleanField(read_only=True)
