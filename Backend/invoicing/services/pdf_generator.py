from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from pathlib import Path

from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone

from invoicing.models import Invoice, InvoiceLine
from payments.models import Deposit, Payment
from reservations.services.pricing import calculate_price_simulation
from vehicles.services.availability import AvailabilityValidationError


LOGO_PATH = Path(__file__).resolve().parents[3] / "Frontend" / "src" / "assets" / "logo-getacar.svg"
EUR_SYMBOL = "€"
INVOICE_STATUS_LABELS = {
	Invoice.Status.DRAFT: "Brouillon",
	Invoice.Status.ISSUED: "Émise",
	Invoice.Status.PAID: "Payée",
	Invoice.Status.CANCELLED: "Annulée",
}
PAYMENT_STATUS_LABELS = {
	Payment.Status.CREE: "Créé",
	Payment.Status.EN_ATTENTE: "En attente",
	Payment.Status.ACTION_REQUISE: "Action requise",
	Payment.Status.TRAITEMENT: "En traitement",
	Payment.Status.REUSSI: "Payé",
	Payment.Status.ECHOUE: "Échoué",
	Payment.Status.ANNULE: "Remboursé",
}
DEPOSIT_STATUS_LABELS = {
	Deposit.Status.CREE: "Créée",
	Deposit.Status.EN_ATTENTE: "En attente",
	Deposit.Status.AUTORISEE: "Autorisée",
	Deposit.Status.A_VERIFIER: "À vérifier",
	Deposit.Status.CAPTUREE: "Capturée",
	Deposit.Status.LIBEREE: "Libérée",
	Deposit.Status.ECHOUEE: "Échouée",
	Deposit.Status.ANNULEE: "Annulée",
	Deposit.Status.EXPIREE: "Expirée",
}
FRENCH_MONTHS = {
	1: "janvier",
	2: "février",
	3: "mars",
	4: "avril",
	5: "mai",
	6: "juin",
	7: "juillet",
	8: "août",
	9: "septembre",
	10: "octobre",
	11: "novembre",
	12: "décembre",
}


def _quantize_amount(value: Decimal) -> Decimal:
	return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _format_decimal_number(value: Decimal) -> str:
	return f"{_quantize_amount(value):.2f}".replace(".", ",")


def format_french_amount(value: Decimal, currency: str = "EUR") -> str:
	symbol = EUR_SYMBOL if currency == "EUR" else currency
	return f"{_format_decimal_number(value)} {symbol}"


def format_french_percentage(value: Decimal) -> str:
	return f"{_format_decimal_number(value)} %"


def format_payment_status(value: str) -> str:
	return PAYMENT_STATUS_LABELS.get(value, value)


def format_deposit_status(value: str) -> str:
	return DEPOSIT_STATUS_LABELS.get(value, value)


def format_invoice_status(value: str) -> str:
	return INVOICE_STATUS_LABELS.get(value, value)


def format_french_datetime(value) -> str:
	local_value = timezone.localtime(value)
	month_name = FRENCH_MONTHS[local_value.month]
	return f"{local_value.day} {month_name} {local_value.year} à {local_value:%H:%M}"


def format_french_date(value) -> str:
	month_name = FRENCH_MONTHS[value.month]
	return f"{value.day} {month_name} {value.year}"


def format_french_duration(value: timedelta) -> str:
	total_minutes = int(value.total_seconds() // 60)
	hours, minutes = divmod(total_minutes, 60)
	days, hours = divmod(hours, 24)
	parts = []
	if days:
		parts.append(f"{days} jour" + ("s" if days > 1 else ""))
	if hours:
		parts.append(f"{hours} heure" + ("s" if hours > 1 else ""))
	if minutes and not days:
		parts.append(f"{minutes} minute" + ("s" if minutes > 1 else ""))
	return " ".join(parts) if parts else "0 heure"


def _build_other_fees(invoice: Invoice) -> list[dict[str, str]]:
	other_fees: list[dict[str, str]] = []
	for line in invoice.lines.exclude(line_type=InvoiceLine.LineType.VEHICLE_RENTAL):
		label = (line.description or line.get_line_type_display()).strip()
		if not label:
			continue
		other_fees.append({
			"label": label,
			"amount": line.total_price,
			"amount_display": format_french_amount(line.total_price, invoice.currency),
		})
	return other_fees


def _fallback_pricing_breakdown(*, invoice: Invoice) -> dict[str, Decimal]:
	reservation = invoice.reservation
	category = reservation.vehicle.category
	duration = reservation.end_at - reservation.start_at
	total_hours = Decimal(duration.total_seconds()) / Decimal("3600")
	billed_hours = int(total_hours.to_integral_value(rounding=ROUND_CEILING))
	billed_days = int((total_hours / Decimal("24")).to_integral_value(rounding=ROUND_CEILING))

	hourly_rate = getattr(category, "hourly_rate", None)
	daily_rate = getattr(category, "daily_rate", None)
	rental_amount = None
	if hourly_rate is not None:
		hourly_amount = _quantize_amount(Decimal(str(hourly_rate)) * Decimal(billed_hours))
		rental_amount = hourly_amount
	if daily_rate is not None:
		daily_amount = _quantize_amount(Decimal(str(daily_rate)) * Decimal(billed_days))
		if rental_amount is None or daily_amount < rental_amount:
			rental_amount = daily_amount

	if rental_amount is None:
		rental_amount = _quantize_amount(Decimal("0.00"))

	insurance_daily_rates = {
		"STANDARD": Decimal("0.00"),
		"DUO": Decimal("8.00"),
		"OMNIUM": Decimal("25.00"),
	}
	insurance_amount = _quantize_amount(insurance_daily_rates.get(reservation.insurance_type, Decimal("0.00")) * Decimal(billed_days))

	return {
		"rental_amount": rental_amount,
		"insurance_amount": insurance_amount,
	}


def _build_pricing_breakdown(*, invoice: Invoice) -> dict[str, Decimal]:
	reservation = invoice.reservation
	try:
		pricing = calculate_price_simulation(
			vehicle=reservation.vehicle,
			start_at=reservation.start_at,
			end_at=reservation.end_at,
			insurance_type=reservation.insurance_type,
		)
		return {
			"rental_amount": pricing.rental_amount,
			"insurance_amount": pricing.insurance_amount,
		}
	except AvailabilityValidationError:
		return _fallback_pricing_breakdown(invoice=invoice)


def _get_latest_payment(reservation) -> Payment | None:
	return reservation.payments.filter(provider=Payment.Provider.STRIPE).order_by("-succeeded_at", "-created_at").first()


def _get_latest_deposit(reservation) -> Deposit | None:
	return reservation.deposits.order_by("-authorized_at", "-created_at").first()


def _build_billed_to_details(invoice: Invoice) -> dict[str, str | None]:
	client_profile = invoice.client
	user = client_profile.user
	full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
	return {
		"name": full_name or user.email,
		"address": (client_profile.address or "").strip() or None,
		"email": (user.email or "").strip() or None,
	}


def build_invoice_financial_details(invoice: Invoice) -> dict[str, object]:
	reservation = invoice.reservation
	pricing = _build_pricing_breakdown(invoice=invoice)
	other_fees = _build_other_fees(invoice)
	other_fees_total = sum((fee["amount"] for fee in other_fees), Decimal("0.00"))
	subtotal_htva = _quantize_amount(pricing["rental_amount"] + pricing["insurance_amount"] + other_fees_total)
	tax_amount = _quantize_amount(invoice.tax_amount)
	tax_rate = _quantize_amount((tax_amount / subtotal_htva * Decimal("100")) if subtotal_htva > 0 else Decimal("0.00"))
	total_tvac = _quantize_amount(subtotal_htva + tax_amount)
	payment = _get_latest_payment(reservation)
	deposit = _get_latest_deposit(reservation)

	line_items = [
		{
			"label": f"Location {reservation.vehicle.brand.name} {reservation.vehicle.model_name}".strip(),
			"amount": pricing["rental_amount"],
			"amount_display": format_french_amount(pricing["rental_amount"], invoice.currency),
		},
		{
			"label": f"Assurance {reservation.get_insurance_type_display()}",
			"amount": pricing["insurance_amount"],
			"amount_display": format_french_amount(pricing["insurance_amount"], invoice.currency),
		},
	]

	for fee in other_fees:
		line_items.append(fee)

	return {
		"line_items": line_items,
		"subtotal": subtotal_htva,
		"subtotal_display": format_french_amount(subtotal_htva, invoice.currency),
		"tax_amount": tax_amount,
		"tax_amount_display": format_french_amount(tax_amount, invoice.currency),
		"tax_rate": tax_rate,
		"tax_rate_display": format_french_percentage(tax_rate),
		"total": total_tvac,
		"total_display": format_french_amount(total_tvac, invoice.currency),
		"payment": {
			"available": payment is not None,
			"status": format_payment_status(payment.status) if payment is not None else None,
			"date": format_french_datetime(payment.succeeded_at or payment.created_at) if payment is not None else None,
			"method": "Stripe" if payment is not None else None,
			"reference": payment.stripe_payment_intent_id if payment is not None and payment.stripe_payment_intent_id else None,
		},
		"deposit": {
			"available": deposit is not None,
			"amount": (deposit.amount if deposit is not None else reservation.deposit_amount),
			"amount_display": format_french_amount(deposit.amount if deposit is not None else reservation.deposit_amount, invoice.currency),
			"status": format_deposit_status(deposit.status) if deposit is not None else None,
			"date": format_french_datetime(deposit.authorized_at or deposit.created_at) if deposit is not None else None,
			"reference": deposit.stripe_payment_intent_id if deposit is not None and deposit.stripe_payment_intent_id else None,
		},
	}


def build_invoice_pdf(invoice: Invoice) -> bytes:
	"""Build the PDF bytes for an invoice using the HTML template."""
	logo_url = LOGO_PATH.as_uri() if LOGO_PATH.exists() else ""
	reservation = invoice.reservation
	context = {
		"invoice": invoice,
		"logo_url": logo_url,
		"billed_to_details": _build_billed_to_details(invoice),
		"invoice_details": {
			"number": invoice.number,
			"issue_date": format_french_date(invoice.issue_date),
			"status": format_invoice_status(invoice.status),
		},
		"reservation_details": {
			"reference": reservation.reference,
			"vehicle": f"{reservation.vehicle.brand} {reservation.vehicle.model_name}".strip(),
			"start_at": format_french_datetime(reservation.start_at),
			"end_at": format_french_datetime(reservation.end_at),
			"duration": format_french_duration(reservation.duration),
			"insurance": reservation.get_insurance_type_display(),
		},
		"financial_details": build_invoice_financial_details(invoice),
	}
	html_content = render_to_string("invoicing/invoice.html", context)
	from weasyprint import HTML

	return HTML(string=html_content).write_pdf()


def ensure_invoice_pdf(invoice: Invoice) -> Invoice:
	"""Generate and persist PDF file if missing, then return the invoice."""
	if invoice.pdf_file:
		return invoice

	pdf_bytes = build_invoice_pdf(invoice)
	filename = f"{invoice.number}.pdf"
	invoice.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
	return invoice
