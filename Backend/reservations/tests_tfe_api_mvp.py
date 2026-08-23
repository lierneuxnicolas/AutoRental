from datetime import date, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientDocument, ClientProfile, Role
from accounts.tests.utils import create_user, ensure_roles
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class TfeMvpReservationsApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.roles = ensure_roles()
        cls.client_user = create_user(
            email="tfe-res-client@example.com",
            password="StrongPass123!",
            role=cls.roles[Role.Code.CLIENT],
            email_verified=True,
        )
        cls.manager_user = create_user(
            email="tfe-res-manager@example.com",
            password="StrongPass123!",
            role=cls.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
            email_verified=True,
        )

        cls.client_profile = ClientProfile.objects.create(
            user=cls.client_user,
            date_of_birth=date(1990, 1, 1),
            address="Rue Reservation 10",
            profile_status=ClientProfile.ProfileStatus.VALIDE,
        )

        expiration = timezone.localdate() + timedelta(days=365)
        ClientDocument.objects.create(
            client=cls.client_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="ID-TFE-1",
            file="client_documents/id_tfe_1.pdf",
            expiration_date=expiration,
            status=ClientDocument.Status.VALIDE,
            is_active=True,
        )
        ClientDocument.objects.create(
            client=cls.client_profile,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            document_number="LIC-TFE-1",
            file="client_documents/lic_tfe_1.pdf",
            expiration_date=expiration,
            status=ClientDocument.Status.VALIDE,
            is_active=True,
        )

        brand = Brand.objects.create(name="TFE Reservation Brand", is_active=True)
        category = VehicleCategory.objects.create(
            name="TFE Reservation Category",
            description="Category for reservation MVP tests",
            daily_rate="60.00",
            hourly_rate="12.00",
            minimum_deposit="350.00",
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(
            name="TFE Reservation Parking",
            address="Rue Parking Reservation 1",
            latitude="50.850340",
            longitude="4.351710",
            capacity=15,
            is_active=True,
        )
        space = ParkingSpace.objects.create(parking=parking, number="R1", is_active=True)
        cls.vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="TFE-RSV-100",
            model_name="Model Reservation",
            year=2024,
            color="Blue",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1200,
            status=Vehicle.Status.DISPONIBLE,
            is_active=True,
        )

    def setUp(self):
        self.client_api = APIClient()
        self.login_url = reverse("accounts:auth-login")
        self.reservations_url = reverse("reservations:reservation-list-create")

    def _authenticate(self, email, password):
        response = self.client_api.post(
            self.login_url,
            {"email": email, "password": password},
            format="json",
        )
        token = response.data["access"]
        self.client_api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _future_period(self):
        start = (timezone.now() + timedelta(hours=6)).replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=4)
        return start, end

    def test_08_create_valid_reservation_returns_201(self):
        self._authenticate("tfe-res-client@example.com", "StrongPass123!")
        start, end = self._future_period()

        response = self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle.id,
                "start_at": start.isoformat(),
                "end_at": end.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)

    def test_09_list_client_reservations_returns_200(self):
        self._authenticate("tfe-res-client@example.com", "StrongPass123!")
        start, end = self._future_period()
        self.client_api.post(
            self.reservations_url,
            {
                "vehicle_id": self.vehicle.id,
                "start_at": start.isoformat(),
                "end_at": end.isoformat(),
                "insurance_type": Reservation.InsuranceType.STANDARD,
            },
            format="json",
        )

        response = self.client_api.get(self.reservations_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertGreaterEqual(response.data["count"], 1)

    def test_10_forbidden_role_and_not_found_detail(self):
        self._authenticate("tfe-res-manager@example.com", "StrongPass123!")
        response = self.client_api.get(self.reservations_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client_api.credentials()
        self._authenticate("tfe-res-client@example.com", "StrongPass123!")
        missing_url = reverse("reservations:reservation-detail", kwargs={"pk": 999999})
        response = self.client_api.get(missing_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
