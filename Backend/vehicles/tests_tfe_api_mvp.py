from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class TfeMvpVehiclesApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.brand = Brand.objects.create(name="TFE Brand", is_active=True)
        cls.category = VehicleCategory.objects.create(
            name="TFE Category",
            description="Category for MVP API tests",
            daily_rate="50.00",
            hourly_rate="10.00",
            minimum_deposit="300.00",
            minimum_rental_hours=1,
            is_active=True,
        )
        cls.parking = Parking.objects.create(
            name="TFE Parking",
            address="Rue Parking 1",
            latitude="50.850340",
            longitude="4.351710",
            capacity=10,
            is_active=True,
        )
        cls.space = ParkingSpace.objects.create(parking=cls.parking, number="T1", is_active=True)
        cls.vehicle = Vehicle.objects.create(
            brand=cls.brand,
            category=cls.category,
            parking_space=cls.space,
            registration_number="TFE-100",
            model_name="Model MVP",
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

    def setUp(self):
        self.client_api = APIClient()

    def test_07_list_available_vehicles_returns_200(self):
        start = (timezone.now() + timedelta(hours=4)).replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=2)

        response = self.client_api.get(
            "/api/v1/vehicles/available/",
            {"start": start.isoformat(), "end": end.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
