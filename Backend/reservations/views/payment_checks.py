from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ClientProfile
from accounts.permissions import IsClient
from accounts.services import check_vehicle_compatibility_for_client, validate_client_for_reservation
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import AvailabilityValidationError, is_vehicle_available


class PaymentChecksRequestSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(min_value=1)
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    reservation_id = serializers.IntegerField(min_value=1, required=False)


ERROR_MESSAGES = {
    "ACCOUNT_INACTIVE": "Compte désactivé. Contactez le support.",
    "EMAIL_NOT_VERIFIED": "Confirmez votre adresse e-mail.",
    "INVALID_ROLE": "Ce compte ne permet pas de réserver. Contactez le support.",
    "PROFILE_INCOMPLETE": "Complétez votre profil client.",
    "PROFILE_NOT_VALID": "Faites valider votre profil client.",
    "UNDER_MINIMUM_AGE": "Vous devez avoir au moins 21 ans au début de la location.",
    "IDENTITY_CARD_MISSING": "Ajoutez votre carte d'identité à votre profil.",
    "IDENTITY_CARD_NOT_VALID": "Faites valider votre carte d'identité.",
    "IDENTITY_CARD_EXPIRED": "Remplacez votre carte d'identité expirée.",
    "IDENTITY_CARD_EXPIRES_TOO_SOON": "La carte d'identité doit rester valide jusqu'au retour.",
    "IDENTITY_CARD_BIRTH_DATE_UNVERIFIED": "Date de naissance officielle non vérifiée.",
    "IDENTITY_CARD_BIRTH_DATE_MISMATCH": "La date de naissance du profil diffère de celle vérifiée. Contactez un gestionnaire pour corriger votre dossier.",
    "DRIVING_LICENSE_MISSING": "Ajoutez votre permis à votre profil.",
    "DRIVING_LICENSE_NOT_VALID": "Faites valider votre permis.",
    "DRIVING_LICENSE_EXPIRED": "Remplacez votre permis expiré.",
    "DRIVING_LICENSE_EXPIRES_TOO_SOON": "Le permis doit rester valide jusqu'au retour.",
}


class ReservationPaymentChecksView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    def post(self, request):
        serializer = PaymentChecksRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        client = get_object_or_404(ClientProfile.objects.select_related("user", "user__role"), user=request.user)
        vehicle = get_object_or_404(Vehicle.objects.select_related("brand", "category"), pk=data["vehicle_id"])
        start, end = data["start_at"], data["end_at"]
        reservation_queryset = Reservation.objects.all()
        if data.get("reservation_id"):
            reservation = get_object_or_404(
                Reservation.objects.filter(
                    client=client,
                    vehicle=vehicle,
                    start_at=start,
                    end_at=end,
                    status__in=[
                        Reservation.Status.BROUILLON,
                        Reservation.Status.EN_ATTENTE_CAUTION,
                        Reservation.Status.EN_ATTENTE_PAIEMENT,
                    ],
                ),
                pk=data["reservation_id"],
            )
            reservation_queryset = reservation_queryset.exclude(pk=reservation.pk)

        try:
            available = is_vehicle_available(
                vehicle=vehicle, start=start, end=end, reservation_queryset=reservation_queryset
            )
            eligibility = validate_client_for_reservation(
                client=client,
                reservation_start_date=timezone.localtime(start).date(),
                reservation_end_date=timezone.localtime(end).date(),
            )
        except (AvailabilityValidationError, DjangoValidationError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        errors = set(eligibility.errors)
        if client.date_of_birth is None:
            errors.add("PROFILE_INCOMPLETE")
        compatibility = check_vehicle_compatibility_for_client(client=client, vehicle=vehicle)

        def result(codes, success):
            matching = [ERROR_MESSAGES[code] for code in ERROR_MESSAGES if code in errors and code in codes]
            return {"valid": not matching, "message": " ".join(matching) if matching else success}

        account_codes = {"ACCOUNT_INACTIVE", "EMAIL_NOT_VERIFIED", "INVALID_ROLE", "PROFILE_INCOMPLETE", "PROFILE_NOT_VALID"}
        identity_codes = {code for code in ERROR_MESSAGES if code.startswith("IDENTITY_CARD_")} | {"UNDER_MINIMUM_AGE"}
        license_codes = {code for code in ERROR_MESSAGES if code.startswith("DRIVING_LICENSE_")}
        identity = result(identity_codes, "Identité validée — 21 ans minimum vérifiés")
        if errors & identity_codes == {"IDENTITY_CARD_BIRTH_DATE_UNVERIFIED"}:
            identity["state"] = "pending"
        return Response({
            "account": result(account_codes, "E-mail vérifié et compte actif"),
            "identity": identity,
            "license": result(license_codes, "Validé"),
            "compatibility": {
                "valid": compatibility.is_compatible and not bool(errors & license_codes),
                "message": compatibility.message or ("Vérifiez votre permis dans votre profil." if errors & license_codes else "Compatible"),
            },
            "availability": {
                "valid": available,
                "message": "Disponible" if available else "Véhicule indisponible. Choisissez une autre période ou un autre véhicule.",
            },
        })
