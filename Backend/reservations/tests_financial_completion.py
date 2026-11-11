from datetime import timedelta
from decimal import Decimal
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from inspections.models import Inspection
from invoicing.models import Invoice
from invoicing.services import create_invoice_for_reservation
from invoicing.services.pdf_generator import build_invoice_financial_details
from payments.models import Deposit, Payment
from reservations.models import Reservation
from reservations.serializers.reservation import ReservationListDetailSerializer
from reservations.tests import ReservationTestDataMixin


class FinancialCompletionTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.api = APIClient()
        now = timezone.now()
        self.reservation = self._create_reservation(
            status=Reservation.Status.A_CONTROLER,
            start_at=now - timedelta(days=1),
            end_at=now,
        )
        self.departure = Inspection.objects.create(
            reservation=self.reservation, inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.TERMINE, completed_at=now - timedelta(days=1),
            energy_level_percent=95,
        )
        self.returned = Inspection.objects.create(
            reservation=self.reservation, inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.TERMINE, completed_at=now,
            energy_level_percent=95,
        )
        self.confirm_url = reverse("reservations:management-reservation-confirm-return-charges", kwargs={"pk": self.reservation.id})
        self.complete_url = reverse("reservations:management-reservation-complete", kwargs={"pk": self.reservation.id})
        self.api.force_authenticate(self.manager_user)

    def _confirm(self):
        return self.api.post(self.confirm_url, {}, format="json")

    def _paid_and_deposit(self):
        Payment.objects.create(
            reservation=self.reservation, amount=self.reservation.rental_amount,
            currency="EUR", status=Payment.Status.REUSSI,
            stripe_payment_intent_id="pi_financial_test", succeeded_at=timezone.now(),
        )
        Deposit.objects.create(
            reservation=self.reservation, mode=Deposit.Mode.SIMULATED,
            amount=Decimal("500.00"), currency="EUR", status=Deposit.Status.A_VERIFIER,
        )

    def test_zero_charges_confirm_once_and_permissions(self):
        self.api.force_authenticate(self.client_user_1)
        self.assertEqual(self._confirm().status_code, 403)
        self.api.force_authenticate(self.manager_user)
        self.assertEqual(self._confirm().status_code, 200)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.return_delay_fee, Decimal("0.00"))
        self.assertEqual(self.reservation.return_fuel_fee, Decimal("0.00"))
        self.assertEqual(self.reservation.return_charges_confirmed_by, self.manager_user)
        self.assertIsNotNone(self.reservation.return_charges_confirmed_at)
        self.assertEqual(self._confirm().status_code, 409)

    def test_positive_charges_are_saved_but_not_automatically_collected_or_closed(self):
        self.returned.completed_at += timedelta(hours=2)
        self.returned.energy_level_percent = 50
        self.returned.save(update_fields=["completed_at", "energy_level_percent"])
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        response = self.api.post(self.complete_url, {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "SUPPLEMENTARY_PAYMENT_REQUIRED")
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.return_delay_fee, Decimal("40.00"))
        self.assertEqual(self.reservation.return_fuel_fee, Decimal("20.00"))
        self.assertEqual(self.reservation.status, Reservation.Status.A_CONTROLER)
        self.assertFalse(Invoice.objects.filter(reservation=self.reservation).exists())
        self.assertEqual(self.reservation.payments.count(), 1)

    def test_missing_fuel_cannot_be_confirmed(self):
        self.departure.energy_level_percent = None
        self.departure.save(update_fields=["energy_level_percent"])
        self.assertEqual(self._confirm().data["code"], "FUEL_LEVEL_REQUIRED")

    def test_submitted_amounts_are_rejected(self):
        response = self.api.post(self.confirm_url, {"delay_fee": "0.00"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.reservation.refresh_from_db()
        self.assertIsNone(self.reservation.return_charges_confirmed_at)

    def test_pending_payment_prevents_closure(self):
        self.assertEqual(self._confirm().status_code, 200)
        self._paid_and_deposit()
        Payment.objects.create(reservation=self.reservation, amount=Decimal("1.00"), status=Payment.Status.TRAITEMENT)
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").data["code"], "PAYMENT_PENDING")
        self.assertFalse(Invoice.objects.filter(reservation=self.reservation).exists())

    def test_zero_charge_closure_generates_one_pdf_and_is_idempotent(self):
        self.assertEqual(self._confirm().status_code, 200)
        self._paid_and_deposit()
        self.assertFalse(ReservationListDetailSerializer(self.reservation).data["invoice_pdf_available"])
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, Reservation.Status.TERMINEE)
        self.assertEqual(Invoice.objects.filter(reservation=self.reservation).count(), 1)
        invoice = Invoice.objects.get(reservation=self.reservation)
        self.assertTrue(invoice.pdf_file.storage.exists(invoice.pdf_file.name))
        self.assertTrue(ReservationListDetailSerializer(self.reservation).data["invoice_pdf_available"])
        details = build_invoice_financial_details(invoice)
        self.assertEqual(details["total"], self.reservation.rental_amount)
        self.assertEqual(details["payment"]["reference"], "pi_financial_test")
        self.assertEqual(details["deposit"]["amount"], Decimal("500.00"))
        self.assertEqual(self.reservation.deposits.get().status, Deposit.Status.LIBEREE)

    def test_historical_pdf_remains_unchanged(self):
        invoice = create_invoice_for_reservation(self.reservation)
        invoice.pdf_file.save("historical.pdf", ContentFile(b"historical"), save=True)
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
        invoice.refresh_from_db()
        with invoice.pdf_file.open("rb") as pdf:
            self.assertEqual(pdf.read(), b"historical")
        self.assertEqual(Invoice.objects.filter(reservation=self.reservation).count(), 1)

    def test_existing_invoice_without_pdf_is_generated_after_closure_and_downloadable(self):
        invoice = create_invoice_for_reservation(self.reservation)
        amount = build_invoice_financial_details(invoice)["total"]
        self.reservation.rental_amount = amount
        self.reservation.save(update_fields=["rental_amount"])
        invoice.subtotal = amount
        invoice.total_amount = amount
        invoice.save(update_fields=["subtotal", "total_amount"])
        line = invoice.lines.get()
        line.unit_price = amount
        line.save(update_fields=["unit_price", "total_price"])
        original_lines = list(invoice.lines.values_list("line_type", "description", "unit_price", "total_price"))
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        self.api.force_authenticate(self.client_user_1)
        list_url = reverse("reservations:reservation-list-create")
        before = self.api.get(list_url)
        self.assertFalse(next(item for item in before.data["results"] if item["id"] == self.reservation.id)["invoice_pdf_available"])
        self.api.force_authenticate(self.manager_user)
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
        invoice.refresh_from_db()
        self.assertTrue(invoice.pdf_file.storage.exists(invoice.pdf_file.name))
        self.assertEqual(original_lines, list(invoice.lines.values_list("line_type", "description", "unit_price", "total_price")))
        detail_url = reverse("reservations:reservation-detail", kwargs={"pk": self.reservation.pk})
        download_url = reverse("invoicing:invoice-download", kwargs={"pk": invoice.pk})
        self.api.force_authenticate(self.client_user_1)
        detail = self.api.get(detail_url)
        self.assertTrue(detail.data["invoice_pdf_available"])
        after = self.api.get(list_url)
        self.assertTrue(next(item for item in after.data["results"] if item["id"] == self.reservation.id)["invoice_pdf_available"])
        response = self.api.get(download_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF-"))
        self.api.force_authenticate(self.client_user_2)
        self.assertEqual(self.api.get(download_url).status_code, 404)

    def test_retry_for_closed_reservation_creates_missing_invoice_only_once(self):
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        self.reservation.status = Reservation.Status.TERMINEE
        self.reservation.save(update_fields=["status"])
        self.reservation.deposits.update(status=Deposit.Status.LIBEREE)
        with patch("payments.services.deposits.release_authorized_deposit") as release:
            self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
            self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
            release.assert_not_called()
        invoice = Invoice.objects.get(reservation=self.reservation)
        self.assertTrue(invoice.pdf_file.storage.exists(invoice.pdf_file.name))
        self.assertEqual(Invoice.objects.filter(reservation=self.reservation).count(), 1)

    def test_retry_requires_settled_financials_and_preserves_inconsistent_invoice(self):
        invoice = create_invoice_for_reservation(self.reservation)
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        self.reservation.status = Reservation.Status.TERMINEE
        self.reservation.save(update_fields=["status"])
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").data["code"], "DEPOSIT_STATUS_INVALID")
        self.reservation.deposits.update(status=Deposit.Status.LIBEREE)
        invoice.total_amount += Decimal("1.00")
        invoice.subtotal += Decimal("1.00")
        invoice.save(update_fields=["total_amount", "subtotal"])
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").data["code"], "INVOICE_INCONSISTENT")
        invoice.refresh_from_db()
        self.assertFalse(invoice.pdf_file)
        self.assertEqual(Invoice.objects.filter(reservation=self.reservation).count(), 1)

    def test_referenced_missing_historical_pdf_is_not_overwritten(self):
        invoice = create_invoice_for_reservation(self.reservation)
        invoice.pdf_file.name = "invoices/missing-historical.pdf"
        invoice.save(update_fields=["pdf_file"])
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        self.reservation.status = Reservation.Status.TERMINEE
        self.reservation.save(update_fields=["status"])
        self.reservation.deposits.update(status=Deposit.Status.LIBEREE)
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").data["code"], "INVOICE_PDF_MISSING")
        invoice.refresh_from_db()
        self.assertEqual(invoice.pdf_file.name, "invoices/missing-historical.pdf")

    def test_pdf_availability_requires_existing_file(self):
        invoice = create_invoice_for_reservation(self.reservation)
        invoice.pdf_file.name = "invoices/missing.pdf"
        invoice.save(update_fields=["pdf_file"])
        self.assertFalse(ReservationListDetailSerializer(self.reservation).data["invoice_pdf_available"])

    @patch("payments.services.deposits.stripe.PaymentIntent.retrieve")
    def test_captured_stripe_deposit_cannot_be_reported_as_released(self, retrieve):
        self._paid_and_deposit()
        deposit = self.reservation.deposits.get()
        deposit.mode = Deposit.Mode.STRIPE_TEST
        deposit.stripe_payment_intent_id = "pi_deposit_test"
        deposit.save(update_fields=["mode", "stripe_payment_intent_id"])
        retrieve.return_value = SimpleNamespace(status="succeeded")
        self.assertEqual(self._confirm().status_code, 200)
        with override_settings(STRIPE_SECRET_KEY="sk_test_example"):
            response = self.api.post(self.complete_url, {}, format="json")
        self.assertEqual(response.data["code"], "DEPOSIT_RELEASE_FAILED")
        deposit.refresh_from_db()
        self.assertEqual(deposit.status, Deposit.Status.A_VERIFIER)
        self.assertFalse(Invoice.objects.filter(reservation=self.reservation).exists())

    def test_pdf_failure_does_not_close_reservation(self):
        self._paid_and_deposit()
        self.assertEqual(self._confirm().status_code, 200)
        with patch("invoicing.services.pdf_generator.ensure_invoice_pdf", side_effect=OSError("PDF unavailable")):
            with self.assertLogs("reservations.services.completion", level="ERROR"):
                response = self.api.post(self.complete_url, {}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "INVOICE_PDF_FAILED")
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, Reservation.Status.A_CONTROLER)
        self.assertFalse(Invoice.objects.filter(reservation=self.reservation).exists())
        self.assertEqual(self.api.post(self.complete_url, {}, format="json").status_code, 200)
        self.assertTrue(Invoice.objects.get(reservation=self.reservation).pdf_file)
