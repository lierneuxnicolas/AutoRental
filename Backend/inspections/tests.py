from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role
from accounts.tests.utils import create_user, ensure_roles
from inspections.models import Inspection
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class DepartureInspectionTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="departure-client@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.api = APIClient()

        self.brand = Brand.objects.create(name="Brand X", is_active=True)
        self.category = VehicleCategory.objects.create(
            name="Category X",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="P1", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="A1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=self.brand,
            category=self.category,
            parking_space=space,
            registration_number="DEP-001",
            model_name="Model",
            year=2024,
            color="Black",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.DISPONIBLE,
            is_active=True,
        )

    def _reservation(self, *, start_at, status=Reservation.Status.CONFIRMEE):
        return Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=3),
            status=status,
            confirmed_at=start_at - timedelta(days=1),
            rental_amount=120,
            deposit_amount=300,
        )

    def _authorize(self, reservation):
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )
        Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=reservation.rental_amount,
            currency="EUR",
            status=Payment.Status.REUSSI,
            succeeded_at=timezone.now(),
        )

    def test_creates_initial_inspection(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["inspection"]["inspection_type"], Inspection.Type.INITIAL)
        self.assertEqual(response.data["inspection"]["status"], Inspection.Status.BROUILLON)
        self.assertIn("mileage", response.data["missing_fields"])
        self.assertTrue(Inspection.objects.filter(reservation=reservation, inspection_type=Inspection.Type.INITIAL).exists())

    def test_refuses_without_successful_payment(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PAYMENT_NOT_SUCCESSFUL")

    def test_refuses_too_early(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(hours=4))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "TOO_EARLY")from django.test import TestCase

# Create your tests here.
