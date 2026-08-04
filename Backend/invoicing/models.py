from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import F, Q
from django.db.models.functions import Upper
from django.utils import timezone


INVOICE_NUMBER_PREFIX = "AR"
INVOICE_NUMBER_MAX_ATTEMPTS = 10


class Invoice(models.Model):
	class Status(models.TextChoices):
		DRAFT = "DRAFT", "Draft"
		ISSUED = "ISSUED", "Issued"
		PAID = "PAID", "Paid"
		CANCELLED = "CANCELLED", "Cancelled"

	number = models.CharField(max_length=32, unique=True, editable=False)
	reservation = models.OneToOneField(
		"reservations.Reservation",
		on_delete=models.PROTECT,
		related_name="invoice",
	)
	client = models.ForeignKey(
		"accounts.ClientProfile",
		on_delete=models.PROTECT,
		related_name="invoices",
	)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.ISSUED)
	issue_date = models.DateField(default=timezone.localdate)
	subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
	tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
	total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
	currency = models.CharField(max_length=3, default="EUR")
	billing_name = models.CharField(max_length=255)
	billing_address = models.TextField()
	pdf_file = models.FileField(upload_to="invoices/", null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-issue_date", "-id"]
		indexes = [
			models.Index(fields=["client", "issue_date"], name="invoice_client_issue_idx"),
			models.Index(fields=["status", "issue_date"], name="invoice_status_issue_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(subtotal__gte=0), name="invoice_subtotal_gte_0"),
			models.CheckConstraint(condition=Q(tax_amount__gte=0), name="invoice_tax_amount_gte_0"),
			models.CheckConstraint(condition=Q(total_amount__gte=0), name="invoice_total_amount_gte_0"),
			models.CheckConstraint(
				condition=Q(total_amount=F("subtotal") + F("tax_amount")),
				name="invoice_total_matches_components",
			),
			models.CheckConstraint(condition=Q(currency=Upper("currency")), name="invoice_currency_upper"),
		]

	def __str__(self) -> str:
		return self.number

	@classmethod
	def _build_number(cls, *, year: int, sequence: int) -> str:
		return f"{INVOICE_NUMBER_PREFIX}-{year}-{sequence:06d}"

	@classmethod
	def _next_sequence_for_year(cls, *, year: int) -> int:
		prefix = f"{INVOICE_NUMBER_PREFIX}-{year}-"
		last_invoice = cls.objects.filter(number__startswith=prefix).order_by("-number").only("number").first()
		if not last_invoice:
			return 1
		try:
			return int(last_invoice.number.rsplit("-", 1)[1]) + 1
		except (IndexError, ValueError):
			return 1

	def clean(self):
		super().clean()
		if self.client_id and self.reservation_id and self.reservation.client_id != self.client_id:
			raise ValidationError({"client": "Le client de la facture doit correspondre au client de la reservation."})

	def save(self, *args, **kwargs):
		if self.pk:
			original_number = type(self).objects.filter(pk=self.pk).values_list("number", flat=True).first()
			if original_number and self.number != original_number:
				raise ValidationError({"number": "Le numero de facture ne peut pas etre modifie."})

		attempts = INVOICE_NUMBER_MAX_ATTEMPTS if self._state.adding and not self.number else 1
		for attempt in range(attempts):
			if self._state.adding and not self.number:
				year = self.issue_date.year if self.issue_date else timezone.localdate().year
				sequence = self._next_sequence_for_year(year=year)
				self.number = self._build_number(year=year, sequence=sequence)

			self.full_clean()

			try:
				with transaction.atomic():
					return super().save(*args, **kwargs)
			except IntegrityError:
				if not self._state.adding or attempt == attempts - 1:
					raise
				self.number = ""

		raise IntegrityError("Impossible de generer un numero de facture unique.")


class InvoiceLine(models.Model):
	class LineType(models.TextChoices):
		VEHICLE_RENTAL = "VEHICLE_RENTAL", "Location du vehicule"
		DELAY = "DELAY", "Retard"
		CLEANING = "CLEANING", "Nettoyage"
		DAMAGE = "DAMAGE", "Dommage"
		FINE = "FINE", "Amende"
		CORRECTION = "CORRECTION", "Correction"

	invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
	line_type = models.CharField(max_length=32, choices=LineType.choices)
	description = models.CharField(max_length=255)
	quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
	unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
	total_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["id"]
		indexes = [
			models.Index(fields=["invoice", "line_type"], name="invoice_line_invoice_type_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(quantity__gt=0), name="invoice_line_qty_gt_0"),
			models.CheckConstraint(condition=Q(unit_price__gte=0), name="invoice_line_unit_price_gte_0"),
			models.CheckConstraint(condition=Q(total_price__gte=0), name="invoice_line_total_price_gte_0"),
			models.CheckConstraint(
				condition=Q(total_price=F("quantity") * F("unit_price")),
				name="invoice_line_total_matches_components",
			),
		]

	def __str__(self) -> str:
		return f"{self.invoice.number} - {self.description}"

	def save(self, *args, **kwargs):
		self.total_price = (self.quantity or Decimal("0.00")) * (self.unit_price or Decimal("0.00"))
		return super().save(*args, **kwargs)
