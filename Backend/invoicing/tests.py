from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientProfile, Role
from accounts.tests.utils import create_user, ensure_roles
from invoicing.models import Invoice, InvoiceLine
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory
from django.test import TestCase


class InvoiceDownloadEndpointTests(TestCase):
	def setUp(self):
		self.api = APIClient()
		roles = ensure_roles()

		self.client_user = create_user(
			email="invoice-client@example.com",
			password="StrongPass123!",
			role=roles[Role.Code.CLIENT],
		)
		self.client_profile = ClientProfile.objects.create(
			user=self.client_user,
			address="10 Rue de Test, Paris",
		)

		brand = Brand.objects.create(name="Brand Invoice", is_active=True)
		category = VehicleCategory.objects.create(
			name="Category Invoice",
			description="Category for invoice tests",
			daily_rate=Decimal("80.00"),
			hourly_rate=Decimal("10.00"),
			minimum_deposit=Decimal("300.00"),
			minimum_rental_hours=1,
			is_active=True,
		)
		parking = Parking.objects.create(
			name="Parking Invoice",
			address="1 Avenue PDF",
			latitude=Decimal("48.856613"),
			longitude=Decimal("2.352222"),
			capacity=20,
			is_active=True,
		)
		space = ParkingSpace.objects.create(parking=parking, number="INV-01", is_active=True)
		vehicle = Vehicle.objects.create(
			brand=brand,
			category=category,
			parking_space=space,
			registration_number="INV-100",
			model_name="Model Invoice",
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

		start_at = timezone.now() + timedelta(days=1)
		end_at = start_at + timedelta(days=2)
		reservation = Reservation.objects.create(
			client=self.client_profile,
			vehicle=vehicle,
			start_at=start_at,
			end_at=end_at,
			status=Reservation.Status.BROUILLON,
			rental_amount=Decimal("160.00"),
			deposit_amount=Decimal("300.00"),
		)

		self.invoice = Invoice.objects.create(
			reservation=reservation,
			client=self.client_profile,
			status=Invoice.Status.ISSUED,
			subtotal=Decimal("160.00"),
			tax_amount=Decimal("32.00"),
			total_amount=Decimal("192.00"),
			currency="EUR",
			billing_name="Client Test",
			billing_address="10 Rue de Test\n75000 Paris",
		)
		InvoiceLine.objects.create(
			invoice=self.invoice,
			line_type=InvoiceLine.LineType.VEHICLE_RENTAL,
			description="Location vehicule",
			quantity=Decimal("2.00"),
			unit_price=Decimal("80.00"),
		)

	def test_download_invoice_returns_valid_pdf(self):
		self.api.force_authenticate(self.client_user)
		url = reverse("invoicing:invoice-download", kwargs={"pk": self.invoice.pk})

		response = self.api.get(url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response["Content-Type"], "application/pdf")
		self.assertIn(f"{self.invoice.number}.pdf", response["Content-Disposition"])

		pdf_bytes = b"".join(response.streaming_content)
		self.assertTrue(pdf_bytes.startswith(b"%PDF"))
		self.assertGreater(len(pdf_bytes), 100)
