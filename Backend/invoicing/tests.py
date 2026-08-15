from datetime import datetime
from decimal import Decimal

import pymupdf
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import ClientProfile, Role
from accounts.tests.utils import create_user, ensure_roles
from invoicing.models import Invoice, InvoiceLine
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory
from django.test import TestCase

from invoicing.services.pdf_generator import (
	LOGO_PATH,
	build_invoice_pdf,
	format_french_date,
	format_deposit_status,
	format_french_amount,
	format_french_datetime,
	format_invoice_status,
	format_payment_status,
	format_french_percentage,
)


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

		current_timezone = timezone.get_current_timezone()
		start_at = timezone.make_aware(datetime(2026, 8, 29, 15, 0), current_timezone)
		end_at = timezone.make_aware(datetime(2026, 8, 30, 10, 0), current_timezone)
		now = timezone.now()
		reservation = Reservation.objects.create(
			client=self.client_profile,
			vehicle=vehicle,
			start_at=start_at,
			end_at=end_at,
			status=Reservation.Status.BROUILLON,
			insurance_type=Reservation.InsuranceType.DUO,
			rental_amount=Decimal("88.00"),
			deposit_amount=Decimal("300.00"),
		)
		Payment.objects.create(
			reservation=reservation,
			provider=Payment.Provider.STRIPE,
			amount=Decimal("88.00"),
			currency="EUR",
			status=Payment.Status.REUSSI,
			stripe_payment_intent_id="pi_test_123",
			succeeded_at=now,
		)
		Deposit.objects.create(
			reservation=reservation,
			mode=Deposit.Mode.SIMULATED,
			amount=Decimal("300.00"),
			currency="EUR",
			status=Deposit.Status.AUTORISEE,
			authorized_at=now,
			stripe_payment_intent_id="pi_deposit_test_123",
		)

		self.invoice = Invoice.objects.create(
			reservation=reservation,
			client=self.client_profile,
			status=Invoice.Status.ISSUED,
			subtotal=Decimal("88.00"),
			tax_amount=Decimal("0.00"),
			total_amount=Decimal("88.00"),
			currency="EUR",
			billing_name="Client Test",
			billing_address="10 Rue de Test\n75000 Paris",
		)
		InvoiceLine.objects.create(
			invoice=self.invoice,
			line_type=InvoiceLine.LineType.VEHICLE_RENTAL,
			description="Location vehicule",
			quantity=Decimal("1.00"),
			unit_price=Decimal("88.00"),
		)
		self.reservation = reservation

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

	def test_generated_pdf_uses_frontend_logo_asset(self):
		self.assertTrue(LOGO_PATH.exists())

		pdf_bytes = build_invoice_pdf(self.invoice)

		self.assertTrue(pdf_bytes.startswith(b"%PDF"))

	def test_generated_pdf_includes_reservation_details(self):
		pdf_bytes = build_invoice_pdf(self.invoice)
		reservation = self.reservation
		pdf_document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
		pdf_text = "\n".join(page.get_text() for page in pdf_document)

		self.assertTrue(pdf_bytes.startswith(b"%PDF"))
		self.assertIn("Détails de la location", pdf_text)
		self.assertIn("Facturé à", pdf_text)
		self.assertIn(f"{self.client_user.first_name} {self.client_user.last_name}".strip(), pdf_text)
		self.assertIn("10 Rue de Test, Paris", pdf_text)
		self.assertIn(self.client_user.email, pdf_text)
		self.assertIn("Numéro:", pdf_text)
		self.assertIn(invoice_details := self.invoice.number, pdf_text)
		self.assertIn("Date d'émission:", pdf_text)
		self.assertIn(format_french_date(self.invoice.issue_date), pdf_text)
		self.assertIn("Statut:", pdf_text)
		self.assertIn(format_invoice_status(self.invoice.status), pdf_text)
		self.assertIn("Référence de réservation", pdf_text)
		self.assertIn(reservation.reference, pdf_text)
		self.assertIn("Véhicule", pdf_text)
		self.assertIn("Brand Invoice Model Invoice", pdf_text)
		self.assertIn("Date et heure de départ", pdf_text)
		self.assertIn(format_french_datetime(reservation.start_at), pdf_text)
		self.assertIn("Date et heure de retour", pdf_text)
		self.assertIn(format_french_datetime(reservation.end_at), pdf_text)
		self.assertIn("Durée de location", pdf_text)
		self.assertIn("19 heures", pdf_text)
		self.assertIn("Assurance choisie", pdf_text)
		self.assertIn("Détails financiers", pdf_text)
		self.assertIn("Location Brand Invoice Model Invoice", pdf_text)
		self.assertIn(format_french_amount(Decimal("80.00")), pdf_text)
		self.assertIn("Assurance Duo", pdf_text)
		self.assertIn(format_french_amount(Decimal("8.00")), pdf_text)
		self.assertIn("Sous-total HTVA", pdf_text)
		self.assertIn(format_french_amount(Decimal("88.00")), pdf_text)
		self.assertIn(f"TVA ({format_french_percentage(Decimal('0.00'))})", pdf_text)
		self.assertIn(format_french_amount(Decimal("0.00")), pdf_text)
		self.assertIn("Total TVAC", pdf_text)
		self.assertIn(format_french_amount(Decimal("88.00")), pdf_text)
		self.assertIn("Paiement", pdf_text)
		self.assertIn(format_payment_status(Payment.Status.REUSSI), pdf_text)
		self.assertIn(format_french_datetime(Payment.objects.get(reservation=reservation).succeeded_at), pdf_text)
		self.assertIn("Stripe", pdf_text)
		self.assertIn("pi_test_123", pdf_text)
		self.assertIn("Caution", pdf_text)
		self.assertIn(format_deposit_status(Deposit.Status.AUTORISEE), pdf_text)
		self.assertIn(format_french_amount(Decimal("300.00")), pdf_text)
		self.assertIn("pi_deposit_test_123", pdf_text)
		self.assertEqual(self.invoice.total_amount, Payment.objects.get(reservation=reservation).amount)
		self.assertNotIn("500 €", pdf_text)
