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

	def test_generated_pdf_includes_complementary_insurance_amount(self):
		Reservation.objects.filter(pk=self.reservation.pk).update(
			insurance_type=Reservation.InsuranceType.COMPLEMENTAIRE,
		)
		self.invoice.refresh_from_db()

		pdf_bytes = build_invoice_pdf(self.invoice)
		pdf_document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
		pdf_text = "\n".join(page.get_text() for page in pdf_document)

		self.assertIn("Assurance Complémentaire", pdf_text)
		self.assertIn(format_french_amount(Decimal("10.00")), pdf_text)
		# Le resume financier provient des champs de la facture (88,00 EUR stockes),
		# plus d'un recalcul de simulation tarifaire.
		self.assertIn("Sous-total HTVA", pdf_text)
		self.assertIn(format_french_amount(self.invoice.subtotal), pdf_text)

	def test_historical_pdf_keeps_billing_details_after_client_pseudonymization(self):
		Invoice.objects.filter(pk=self.invoice.pk).update(
			billing_name="Client & Associés",
			billing_address="Rue du Test <A>\n1000 Bruxelles",
		)
		self.invoice.refresh_from_db()

		def invoice_text(invoice):
			with pymupdf.open(stream=build_invoice_pdf(invoice), filetype="pdf") as document:
				return "\n".join(page.get_text() for page in document)

		original = invoice_text(self.invoice)
		self.client_user.first_name = "Compte"
		self.client_user.last_name = "Clôturé"
		self.client_user.email = "closed-account@example.invalid"
		self.client_user.is_active = False
		self.client_user.save(update_fields=["first_name", "last_name", "email", "is_active"])
		self.client_profile.address = ""
		self.client_profile.save(update_fields=["address"])
		self.invoice.refresh_from_db()

		rebuilt = invoice_text(self.invoice)
		self.assertEqual(rebuilt, original)
		self.assertIn("Client & Associés", rebuilt)
		self.assertIn("Rue du Test <A>", rebuilt)
		self.assertIn("1000 Bruxelles", rebuilt)
		self.assertIn(self.invoice.number, rebuilt)
		self.assertIn(format_french_amount(self.invoice.total_amount), rebuilt)
		self.assertNotIn("closed-account@example.invalid", rebuilt)

	def test_generated_pdf_includes_reservation_details(self):
		pdf_bytes = build_invoice_pdf(self.invoice)
		reservation = self.reservation
		pdf_document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
		pdf_text = "\n".join(page.get_text() for page in pdf_document)

		self.assertTrue(pdf_bytes.startswith(b"%PDF"))
		self.assertIn("Détails de la location", pdf_text)
		self.assertIn("Facturé à", pdf_text)
		self.assertIn(self.invoice.billing_name, pdf_text)
		for line in self.invoice.billing_address.splitlines():
			self.assertIn(line, pdf_text)
		self.assertNotIn(self.client_user.email, pdf_text)
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


from reservations.tests import ReservationTestDataMixin


class InvoiceMultiTypeTests(ReservationTestDataMixin, TestCase):
	"""Tache 5.2 : plusieurs factures par reservation, une seule par type."""

	def setUp(self):
		super().setUp()
		self.reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self.client_profile = self.reservation.client

	def _create_invoice(self, invoice_type):
		return Invoice.objects.create(
			reservation=self.reservation,
			client=self.client_profile,
			invoice_type=invoice_type,
			status=Invoice.Status.ISSUED,
			subtotal=Decimal("50.00"),
			tax_amount=Decimal("0.00"),
			total_amount=Decimal("50.00"),
			currency="EUR",
			billing_name="Client Test",
			billing_address="10 Rue de Test",
		)

	def test_existing_invoice_defaults_to_location_and_stays_accessible(self):
		invoice = self._create_invoice(Invoice.InvoiceType.LOCATION)

		self.assertEqual(invoice.invoice_type, Invoice.InvoiceType.LOCATION)
		self.assertEqual(self.reservation.invoices.count(), 1)
		self.assertEqual(self.reservation.invoices.first().id, invoice.id)

	def test_reservation_can_have_location_and_complementary_invoices(self):
		location = self._create_invoice(Invoice.InvoiceType.LOCATION)
		complementary = self._create_invoice(Invoice.InvoiceType.COMPLEMENTAIRE)

		self.assertEqual(self.reservation.invoices.count(), 2)
		self.assertNotEqual(location.number, complementary.number)
		types = set(self.reservation.invoices.values_list("invoice_type", flat=True))
		self.assertEqual(types, {"LOCATION", "COMPLEMENTAIRE"})

	def test_duplicate_invoice_type_is_rejected(self):
		from django.core.exceptions import ValidationError as DjangoValidationError
		from django.db import IntegrityError

		self._create_invoice(Invoice.InvoiceType.COMPLEMENTAIRE)

		with self.assertRaises((DjangoValidationError, IntegrityError)):
			self._create_invoice(Invoice.InvoiceType.COMPLEMENTAIRE)

	def test_create_invoice_service_scopes_by_type(self):
		from invoicing.services import create_invoice_for_reservation

		location = create_invoice_for_reservation(self.reservation)
		cancellation = create_invoice_for_reservation(self.reservation, invoice_type=Invoice.InvoiceType.ANNULATION)
		location_again = create_invoice_for_reservation(self.reservation)

		self.assertEqual(location.invoice_type, Invoice.InvoiceType.LOCATION)
		self.assertEqual(cancellation.invoice_type, Invoice.InvoiceType.ANNULATION)
		self.assertEqual(location.id, location_again.id)
		self.assertEqual(self.reservation.invoices.count(), 2)

	def test_pdf_generation_still_works_after_model_change(self):
		invoice = self._create_invoice(Invoice.InvoiceType.LOCATION)
		InvoiceLine.objects.create(
			invoice=invoice,
			line_type=InvoiceLine.LineType.VEHICLE_RENTAL,
			description="Location vehicule",
			quantity=Decimal("1.00"),
			unit_price=Decimal("50.00"),
		)

		pdf_bytes = build_invoice_pdf(invoice)

		self.assertTrue(pdf_bytes.startswith(b"%PDF"))


class AdditionalChargesInvoiceTests(ReservationTestDataMixin, TestCase):
	"""Tache 5.3 : facture complementaire des frais valides."""

	def setUp(self):
		super().setUp()
		self.api = APIClient()
		self.reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self.reservation.deposit_amount = Decimal("500.00")
		self.reservation.save(update_fields=["deposit_amount", "updated_at"])

	def _create_deposit(self, *, status=Deposit.Status.CAPTUREE, captured_amount=Decimal("0.00")):
		return Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.STRIPE_TEST,
			amount=Decimal("500.00"),
			currency="EUR",
			status=status,
			captured_amount=captured_amount,
			stripe_payment_intent_id="pi_charge_invoice_123",
			authorized_at=timezone.now(),
			captured_at=timezone.now() if status == Deposit.Status.CAPTUREE else None,
		)

	def _create_validated_charge(self, charge_type, amount, justification="Constat documente"):
		from reservations.models import ReservationAdditionalCharge

		return ReservationAdditionalCharge.objects.create(
			reservation=self.reservation,
			charge_type=charge_type,
			amount=Decimal(amount),
			justification=justification,
			status=ReservationAdditionalCharge.Status.VALIDEE,
		)

	def test_no_validated_charges_creates_no_invoice(self):
		from invoicing.services import create_additional_charges_invoice

		self._create_deposit(status=Deposit.Status.LIBEREE)

		invoice = create_additional_charges_invoice(self.reservation)

		self.assertIsNone(invoice)
		self.assertFalse(Invoice.objects.filter(reservation=self.reservation).exists())

	def test_validated_charges_produce_invoice_matching_total(self):
		from invoicing.services import create_additional_charges_invoice

		self._create_deposit(captured_amount=Decimal("110.50"))
		self._create_validated_charge("RETARD", "30.00", "Retour avec 45 minutes de retard")
		self._create_validated_charge("DEGATS", "80.50", "Rayure portiere avant droite")

		invoice = create_additional_charges_invoice(self.reservation)

		self.assertIsNotNone(invoice)
		self.assertEqual(invoice.invoice_type, Invoice.InvoiceType.COMPLEMENTAIRE)
		self.assertEqual(invoice.total_amount, Decimal("110.50"))
		self.assertEqual(invoice.lines.count(), 2)
		descriptions = list(invoice.lines.values_list("description", flat=True))
		self.assertTrue(any("Retour avec 45 minutes de retard" in d for d in descriptions))
		self.assertTrue(any("Rayure portiere avant droite" in d for d in descriptions))

	def test_charges_above_deposit_invoice_full_amount_with_remaining_due(self):
		from invoicing.services import create_additional_charges_invoice
		from invoicing.services.pdf_generator import build_invoice_financial_details

		self._create_deposit(captured_amount=Decimal("500.00"))
		self._create_validated_charge("DEGATS", "650.00", "Dommages importants carrosserie")

		invoice = create_additional_charges_invoice(self.reservation)

		self.assertEqual(invoice.total_amount, Decimal("650.00"))
		details = build_invoice_financial_details(invoice)
		self.assertEqual(details["total"], Decimal("650.00"))
		self.assertEqual(details["payment"]["amount_display"], format_french_amount(Decimal("500.00"), "EUR"))
		self.assertEqual(details["payment"]["balance_display"], format_french_amount(Decimal("150.00"), "EUR"))
		self.assertIn("Partiellement", details["payment"]["status"])

	def test_multiple_charges_create_distinct_lines(self):
		from invoicing.services import create_additional_charges_invoice

		self._create_deposit(captured_amount=Decimal("160.00"))
		self._create_validated_charge("RETARD", "40.00")
		self._create_validated_charge("CARBURANT", "20.00")
		self._create_validated_charge("KILOMETRAGE", "30.00")
		self._create_validated_charge("DEGATS", "70.00")

		invoice = create_additional_charges_invoice(self.reservation)

		self.assertEqual(invoice.lines.count(), 4)
		self.assertEqual(invoice.total_amount, Decimal("160.00"))

	def test_repeated_call_reuses_single_invoice(self):
		from invoicing.services import create_additional_charges_invoice

		self._create_deposit(captured_amount=Decimal("110.50"))
		self._create_validated_charge("DEGATS", "110.50")

		first = create_additional_charges_invoice(self.reservation)
		second = create_additional_charges_invoice(self.reservation)

		self.assertEqual(first.id, second.id)
		self.assertEqual(
			Invoice.objects.filter(reservation=self.reservation, invoice_type=Invoice.InvoiceType.COMPLEMENTAIRE).count(),
			1,
		)

	def test_pdf_is_generated_and_downloadable(self):
		from invoicing.services import create_additional_charges_invoice
		from invoicing.services.pdf_generator import ensure_invoice_pdf

		self._create_deposit(captured_amount=Decimal("110.50"))
		self._create_validated_charge("DEGATS", "110.50", "Rayure profonde")

		invoice = create_additional_charges_invoice(self.reservation)
		invoice = ensure_invoice_pdf(invoice)

		self.assertTrue(invoice.pdf_file)
		pdf_bytes = build_invoice_pdf(invoice)
		self.assertTrue(pdf_bytes.startswith(b"%PDF"))

		self.api.force_authenticate(self.manager_user)
		url = reverse("invoicing:invoice-download", kwargs={"pk": invoice.pk})
		response = self.api.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response["Content-Type"], "application/pdf")

	def test_existing_rental_invoice_is_preserved(self):
		from invoicing.services import create_additional_charges_invoice, create_invoice_for_reservation

		rental_invoice = create_invoice_for_reservation(self.reservation)
		self._create_deposit(captured_amount=Decimal("110.50"))
		self._create_validated_charge("DEGATS", "110.50")

		complementary = create_additional_charges_invoice(self.reservation)

		rental_invoice.refresh_from_db()
		self.assertEqual(rental_invoice.invoice_type, Invoice.InvoiceType.LOCATION)
		self.assertNotEqual(rental_invoice.id, complementary.id)
		self.assertEqual(self.reservation.invoices.count(), 2)

	def test_invoice_requires_confirmed_settlement(self):
		from invoicing.services import InvoiceCreationNotAvailable, create_additional_charges_invoice

		self._create_deposit(status=Deposit.Status.AUTORISEE)
		self._create_validated_charge("DEGATS", "110.50")

		with self.assertRaises(InvoiceCreationNotAvailable):
			create_additional_charges_invoice(self.reservation)

	def test_invoice_requires_known_captured_amount(self):
		from invoicing.services import InvoiceCreationNotAvailable, create_additional_charges_invoice

		self._create_deposit(captured_amount=None)
		self._create_validated_charge("DEGATS", "110.50")

		with self.assertRaises(InvoiceCreationNotAvailable):
			create_additional_charges_invoice(self.reservation)


class VatVentilationTests(ReservationTestDataMixin, TestCase):
	"""Tache 5.4.1 : ventilation HTVA / TVA 21 % sur les montants TVAC."""

	def setUp(self):
		super().setUp()
		self.reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
		self.reservation.deposit_amount = Decimal("500.00")
		self.reservation.save(update_fields=["deposit_amount", "updated_at"])

	def test_split_tvac_amount_rounds_to_two_decimals_and_sums_exactly(self):
		from invoicing.services.invoice_creation import split_tvac_amount

		cases = {
			Decimal("89.00"): (Decimal("73.55"), Decimal("15.45")),
			Decimal("110.50"): (Decimal("91.32"), Decimal("19.18")),
			Decimal("120.00"): (Decimal("99.17"), Decimal("20.83")),
			Decimal("0.00"): (Decimal("0.00"), Decimal("0.00")),
		}
		for tvac, expected in cases.items():
			htva, tva = split_tvac_amount(tvac)
			self.assertEqual((htva, tva), expected)
			self.assertEqual(htva + tva, tvac)

	def test_location_invoice_ventilates_vat_and_preserves_tvac_total(self):
		from invoicing.services import create_invoice_for_reservation
		from invoicing.services.invoice_creation import split_tvac_amount

		invoice = create_invoice_for_reservation(self.reservation)

		expected_htva, expected_tva = split_tvac_amount(self.reservation.rental_amount)
		self.assertEqual(invoice.subtotal, expected_htva)
		self.assertEqual(invoice.tax_amount, expected_tva)
		self.assertEqual(invoice.total_amount, self.reservation.rental_amount)
		line = invoice.lines.get()
		self.assertEqual(line.total_price, expected_htva)

	def test_complementary_invoice_taxes_services_but_not_damage_indemnity(self):
		from invoicing.services import create_additional_charges_invoice
		from invoicing.services.invoice_creation import split_tvac_amount
		from reservations.models import ReservationAdditionalCharge

		Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.STRIPE_TEST,
			amount=Decimal("500.00"),
			currency="EUR",
			status=Deposit.Status.CAPTUREE,
			captured_amount=Decimal("130.50"),
			authorized_at=timezone.now(),
			captured_at=timezone.now(),
		)
		for charge_type, amount in (("RETARD", "30.00"), ("CARBURANT", "20.00"), ("DEGATS", "80.50")):
			ReservationAdditionalCharge.objects.create(
				reservation=self.reservation,
				charge_type=charge_type,
				amount=Decimal(amount),
				justification="Constat documente",
				status=ReservationAdditionalCharge.Status.VALIDEE,
			)

		invoice = create_additional_charges_invoice(self.reservation)

		retard_htva, retard_tva = split_tvac_amount(Decimal("30.00"))
		carburant_htva, carburant_tva = split_tvac_amount(Decimal("20.00"))
		expected_subtotal = retard_htva + carburant_htva + Decimal("80.50")
		expected_tax = retard_tva + carburant_tva
		self.assertEqual(invoice.subtotal, expected_subtotal)
		self.assertEqual(invoice.tax_amount, expected_tax)
		# Le total TVAC facture reste exactement la somme des frais valides.
		self.assertEqual(invoice.total_amount, Decimal("130.50"))

	def test_financial_details_display_21_percent_when_taxed_and_0_for_legacy(self):
		from invoicing.services import create_invoice_for_reservation
		from invoicing.services.pdf_generator import build_invoice_financial_details

		new_invoice = create_invoice_for_reservation(self.reservation)
		details = build_invoice_financial_details(new_invoice)
		self.assertEqual(details["tax_rate"], Decimal("21.00"))
		self.assertEqual(details["total"], new_invoice.total_amount)
		self.assertEqual(details["subtotal"], new_invoice.subtotal)

		legacy_reservation = self._create_reservation(status=Reservation.Status.TERMINEE)
		legacy_invoice = Invoice.objects.create(
			reservation=legacy_reservation,
			client=legacy_reservation.client,
			status=Invoice.Status.ISSUED,
			subtotal=Decimal("88.00"),
			tax_amount=Decimal("0.00"),
			total_amount=Decimal("88.00"),
			currency="EUR",
			billing_name="Client Legacy",
			billing_address="Adresse legacy",
		)
		legacy_details = build_invoice_financial_details(legacy_invoice)
		self.assertEqual(legacy_details["tax_rate"], Decimal("0.00"))
		self.assertEqual(legacy_details["subtotal"], Decimal("88.00"))
		self.assertEqual(legacy_details["total"], Decimal("88.00"))

	def test_legacy_pdf_is_not_regenerated(self):
		from django.core.files.base import ContentFile
		from invoicing.services.pdf_generator import ensure_invoice_pdf

		invoice = Invoice.objects.create(
			reservation=self.reservation,
			client=self.client_profile_1,
			status=Invoice.Status.ISSUED,
			subtotal=Decimal("88.00"),
			tax_amount=Decimal("0.00"),
			total_amount=Decimal("88.00"),
			currency="EUR",
			billing_name="Client Legacy",
			billing_address="Adresse legacy",
		)
		invoice.pdf_file.save("legacy.pdf", ContentFile(b"legacy-pdf"), save=True)

		ensure_invoice_pdf(invoice)

		invoice.refresh_from_db()
		with invoice.pdf_file.open("rb") as pdf:
			self.assertEqual(pdf.read(), b"legacy-pdf")
