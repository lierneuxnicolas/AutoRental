from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


class Tfe81VehiclesApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        brand = Brand.objects.create(name="TFE81 Brand", is_active=True)
        category = VehicleCategory.objects.create(
            name="TFE81 Category",
            description="Vehicle category for 8.1 API tests",
            daily_rate="55.00",
            hourly_rate="10.00",
            minimum_deposit="300.00",
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(
            name="TFE81 Parking",
            address="Rue Parking 8.1",
            latitude="50.850340",
            longitude="4.351710",
            capacity=8,
            is_active=True,
        )
        space = ParkingSpace.objects.create(parking=parking, number="V1", is_active=True)
        Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="TFE81-100",
            model_name="Model Available",
            year=2024,
            color="Black",
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

    def test_09_available_vehicles_endpoint_returns_200(self):
        start = (timezone.now() + timedelta(hours=4)).replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=2)

        response = self.client_api.get(
            "/api/v1/vehicles/available/",
            {"start": start.isoformat(), "end": end.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
