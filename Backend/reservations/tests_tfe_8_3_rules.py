from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile
from payments.models import Deposit
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin


class Tfe83ReservationRulesTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.client_user_1)
        self.reservations_url = reverse("reservations:reservation-list-create")

    def _period(self, *, start_hours=6, duration_hours=4):
        start_date = timezone.localdate() + timedelta(days=3)
        start_at = timezone.make_aware(datetime.combine(start_date, time(10)))
        return start_at, start_at + timedelta(days=max(1, duration_hours // 24))

    def _create_authorized_deposit(self, reservation):
        return Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )

    def test_01_underage_client_reservation_is_refused(self):
        self.client_profile_1.date_of_birth = timezone.localdate() - timedelta(days=20 * 365)
        self.client_profile_1.save(update_fields=["date_of_birth", "updated_at"])
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
        self.assertIn("UNDER_MINIMUM_AGE", response.data["details"]["eligibility_errors"])

    def test_02_driving_license_expiring_before_end_is_refused(self):
        start_at, end_at = self._period(duration_hours=24)
        license_doc = ClientDocument.objects.filter(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        ).latest("id")
        license_doc.expiration_date = end_at.date() - timedelta(days=1)
        license_doc.save(update_fields=["expiration_date", "updated_at"])

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
        self.assertIn("DRIVING_LICENSE_EXPIRES_TOO_SOON", response.data["details"]["eligibility_errors"])

    def test_03_non_valid_profile_or_documents_is_refused(self):
        self.client_profile_1.profile_status = ClientProfile.ProfileStatus.INCOMPLET
        self.client_profile_1.save(update_fields=["profile_status", "updated_at"])
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PROFILE_NOT_ELIGIBLE")
        self.assertIn("PROFILE_NOT_VALID", response.data["details"]["eligibility_errors"])

    def test_04_invalid_reservation_dates_are_refused(self):
        start_at, _end_at = self._period()
        invalid_end_at = start_at - timedelta(days=1)

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": invalid_end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_at", response.data)

    def test_05_overlapping_reservation_is_refused(self):
        start_at, end_at = self._period()
        self._create_reservation(
            client=self.client_profile_2,
            vehicle=self.vehicle_available,
            status=Reservation.Status.CONFIRMEE,
            start_at=start_at + timedelta(minutes=15),
            end_at=end_at - timedelta(minutes=15),
        )

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "VEHICLE_UNAVAILABLE")

    def test_06_valid_reservation_is_created_with_draft_status(self):
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reservation = Reservation.objects.get(pk=response.data["id"])
        self.assertEqual(reservation.status, Reservation.Status.BROUILLON)

    def test_automatic_only_license_can_reserve_an_automatic_vehicle(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.B
        license_document.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        license_document.save(update_fields=["driving_license_category", "driving_license_transmission", "updated_at"])
        self.vehicle_available.transmission = "Automatique"
        self.vehicle_available.save(update_fields=["transmission", "updated_at"])
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_automatic_only_license_cannot_reserve_a_manual_vehicle(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.B
        license_document.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        license_document.save(update_fields=["driving_license_category", "driving_license_transmission", "updated_at"])
        self.vehicle_available.transmission = "Manuelle"
        self.vehicle_available.save(update_fields=["transmission", "updated_at"])
        start_at, end_at = self._period()
        reservations_before = Reservation.objects.count()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "VEHICLE_INCOMPATIBLE_WITH_LICENSE")
        self.assertIn("uniquement les véhicules automatiques", response.data["message"])
        self.assertIn("boîte manuelle", response.data["message"])
        self.assertEqual(Reservation.objects.count(), reservations_before)

    def test_manual_and_automatic_license_can_reserve_a_manual_vehicle(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.B
        license_document.driving_license_transmission = ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC
        license_document.save(update_fields=["driving_license_category", "driving_license_transmission", "updated_at"])
        self.vehicle_available.transmission = "Manual"
        self.vehicle_available.save(update_fields=["transmission", "updated_at"])
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_license_without_car_authorizing_category_cannot_reserve(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.A
        license_document.driving_license_transmission = (
            ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC
        )
        license_document.save(
            update_fields=["driving_license_category", "driving_license_transmission", "updated_at"]
        )
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "DRIVING_LICENSE_CATEGORY_INCOMPATIBLE")
        self.assertIn("Une catégorie B est requise", response.data["message"])
        self.assertEqual(Reservation.objects.filter(client=self.client_profile_1).count(), 0)

    def test_category_be_license_can_reserve_a_vehicle(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.BE
        license_document.driving_license_transmission = (
            ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC
        )
        license_document.save(
            update_fields=["driving_license_category", "driving_license_transmission", "updated_at"]
        )
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_client_declared_license_type_does_not_replace_manager_verification(self):
        license_document = ClientDocument.objects.get(
            client=self.client_profile_1,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            is_active=True,
        )
        license_document.driving_license_category = ClientDocument.DrivingLicenseCategory.B
        license_document.driving_license_transmission = None
        license_document.driving_license_transmission_declared = (
            ClientDocument.DrivingLicenseTransmission.MANUAL_AND_AUTOMATIC
        )
        license_document.save(
            update_fields=[
                "driving_license_category",
                "driving_license_transmission",
                "driving_license_transmission_declared",
                "updated_at",
            ]
        )
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "DRIVING_LICENSE_DETAILS_UNVERIFIED")
        self.assertEqual(Reservation.objects.filter(client=self.client_profile_1).count(), 0)

    def test_vehicle_with_unknown_transmission_blocks_reservation(self):
        self.vehicle_available.transmission = "Semi-automatic"
        self.vehicle_available.save(update_fields=["transmission", "updated_at"])
        start_at, end_at = self._period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "VEHICLE_TRANSMISSION_UNKNOWN")
        self.assertEqual(Reservation.objects.filter(client=self.client_profile_1).count(), 0)

    def test_07_availability_is_rechecked_before_payment_confirmation(self):
        start_at, end_at = self._period()
        create_response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle_available.id,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "insurance_type": Reservation.InsuranceType.COMPLEMENTAIRE,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        reservation = Reservation.objects.get(pk=create_response.data["id"])
        self._create_authorized_deposit(reservation)
        self._create_reservation(
            client=self.client_profile_2,
            vehicle=self.vehicle_available,
            status=Reservation.Status.CONFIRMEE,
            start_at=start_at + timedelta(minutes=15),
            end_at=end_at - timedelta(minutes=15),
        )
        payment_intent_url = reverse("reservations:reservation-payment-intent", kwargs={"pk": reservation.id})

        with (
            patch("payments.services.payment_intents.stripe.PaymentIntent.create") as mocked_create,
            self.settings(STRIPE_SECRET_KEY="sk_test_123"),
        ):
            response = self.client_api.post(payment_intent_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "RESERVATION_UNAVAILABLE")
        mocked_create.assert_not_called()
