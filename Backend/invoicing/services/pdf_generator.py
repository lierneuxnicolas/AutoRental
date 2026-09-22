from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from invoicing.models import Invoice, InvoiceLine
from payments.models import Deposit, Payment
from reservations.services.pricing import calculate_price_simulation
from vehicles.services.availability import AvailabilityValidationError


LOGO_PATH = Path(__file__).resolve().parents[3] / "Frontend" / "src" / "assets" / "logo-getacar.svg"
EUR_SYMBOL = "€"
# Fictive GetaCar academic-project identity, matching the values used on the public /legal-notice page.
GETACAR_LEGAL_NAME = "GetaCar SRL"
GETACAR_ADDRESS_LINES = ["Parking GetaCar - Gare Centrale", "Rue des Mobilites 12", "1000 Bruxelles", "Belgique"]
GETACAR_COMPANY_NUMBER = "BE 1111.111.111"
GETACAR_VAT_NUMBER = "BE 1111.111.111"
GETACAR_CONTACT_EMAIL = "contact@getacar.be"
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


def _format_person_name(name: str) -> str:
	"""Capitalize a raw name for display (e.g. 'nicolas lierneux' -> 'Nicolas Lierneux')."""
	return " ".join(part.strip().title() for part in name.split(" ") if part.strip())


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
		"name": _format_person_name(full_name) if full_name else user.email,
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


def _invoice_pdf_footer(canvas_obj, _doc) -> None:
	canvas_obj.saveState()
	canvas_obj.setFont("Helvetica", 8)
	canvas_obj.setFillColor(colors.HexColor("#94A3B8"))
	canvas_obj.drawCentredString(A4[0] / 2, 15 * mm, f"{GETACAR_LEGAL_NAME} \u2014 Projet acad\u00e9mique")
	canvas_obj.drawCentredString(A4[0] / 2, 11 * mm, GETACAR_CONTACT_EMAIL)
	canvas_obj.restoreState()


def build_invoice_pdf(invoice: Invoice) -> bytes:
	"""Build the PDF bytes for an invoice using ReportLab (pure Python, no native GTK/Pango/Cairo dependency)."""
	reservation = invoice.reservation
	billed_to = _build_billed_to_details(invoice)
	financial = build_invoice_financial_details(invoice)

	brand_dark_blue = colors.HexColor("#002B50")
	text_dark = colors.HexColor("#1F2937")
	muted_grey = colors.HexColor("#6B7280")
	border_grey = colors.HexColor("#D1D5DB")
	header_bg = colors.HexColor("#F3F4F6")

	styles = getSampleStyleSheet()
	brand_style = ParagraphStyle("Brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=17, textColor=brand_dark_blue, leading=19)
	brand_line_style = ParagraphStyle("BrandLine", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, textColor=text_dark, leading=11)
	muted_style = ParagraphStyle("Muted", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=muted_grey, leading=9.5)
	tiny_italic_style = ParagraphStyle("TinyItalic", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=7, textColor=muted_grey, leading=8.5)
	invoice_title_style = ParagraphStyle("InvoiceTitle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=20, textColor=brand_dark_blue, alignment=TA_RIGHT, leading=22)
	meta_style = ParagraphStyle("Meta", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=text_dark, alignment=TA_RIGHT, leading=11.5)
	paid_style = ParagraphStyle("Paid", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.HexColor("#15803D"), alignment=TA_RIGHT, leading=11.5)
	heading_style = ParagraphStyle("Heading", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11.5, textColor=text_dark, spaceBefore=6, spaceAfter=3)
	body_style = ParagraphStyle("Body", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=text_dark, leading=11.5)
	cell_label_style = ParagraphStyle("CellLabel", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, textColor=text_dark, leading=10.5)
	cell_value_style = ParagraphStyle("CellValue", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=text_dark, leading=10.5)
	total_label_style = ParagraphStyle("TotalLabel", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11.5, textColor=colors.white)
	total_value_style = ParagraphStyle("TotalValue", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12.5, textColor=colors.white, alignment=TA_RIGHT)
	amount_style = ParagraphStyle("Amount", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=text_dark, alignment=TA_RIGHT)
	note_style = ParagraphStyle("Note", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, textColor=muted_grey, leading=9)

	def _info_table(rows: list[tuple[str, str]]) -> Table:
		table_data = [[Paragraph(label, cell_label_style), Paragraph(str(value), cell_value_style)] for label, value in rows]
		table = Table(table_data, colWidths=[65 * mm, 109 * mm])
		table.setStyle(TableStyle([
			("GRID", (0, 0), (-1, -1), 0.6, border_grey),
			("BACKGROUND", (0, 0), (0, -1), header_bg),
			("VALIGN", (0, 0), (-1, -1), "TOP"),
			("LEFTPADDING", (0, 0), (-1, -1), 5),
			("RIGHTPADDING", (0, 0), (-1, -1), 5),
			("TOPPADDING", (0, 0), (-1, -1), 2),
			("BOTTOMPADDING", (0, 0), (-1, -1), 2),
		]))
		return table

	elements: list = []

	payment = financial["payment"]
	is_paid = bool(payment["available"] and payment["status"] == format_payment_status(Payment.Status.REUSSI))

	meta_lines = [
		Paragraph("FACTURE", invoice_title_style),
		Spacer(1, 1.5 * mm),
		Paragraph(f"<b>Num\u00e9ro:</b> {invoice.number}", meta_style),
		Paragraph(f"<b>Date d'\u00e9mission:</b> {format_french_date(invoice.issue_date)}", meta_style),
		Paragraph(f"<b>Statut:</b> {format_invoice_status(invoice.status)}", meta_style),
	]
	if is_paid:
		meta_lines.append(Spacer(1, 1 * mm))
		meta_lines.append(Paragraph(f"Facture pay\u00e9e le {payment['date']}", paid_style))

	header_table = Table(
		[[
			[
				Paragraph("GetaCar", brand_style),
				Paragraph(GETACAR_LEGAL_NAME, brand_line_style),
				Paragraph(GETACAR_ADDRESS_LINES[0], muted_style),
				Paragraph(", ".join(GETACAR_ADDRESS_LINES[1:]), muted_style),
				Paragraph(f"N\u00b0 entreprise: {GETACAR_COMPANY_NUMBER} \u2014 N\u00b0 TVA: {GETACAR_VAT_NUMBER}", muted_style),
				Paragraph(f"E-mail: {GETACAR_CONTACT_EMAIL}", muted_style),
				Paragraph("(Coordonn\u00e9es fictives \u2014 projet acad\u00e9mique)", tiny_italic_style),
			],
			meta_lines,
		]],
		colWidths=[100 * mm, 74 * mm],
	)
	header_table.setStyle(TableStyle([
		("VALIGN", (0, 0), (-1, -1), "TOP"),
		("LEFTPADDING", (0, 0), (-1, -1), 0),
		("RIGHTPADDING", (0, 0), (-1, -1), 0),
	]))
	elements.append(header_table)
	elements.append(Spacer(1, 3 * mm))
	elements.append(HRFlowable(width="100%", color=brand_dark_blue, thickness=1.2))
	elements.append(Spacer(1, 4 * mm))

	elements.append(Paragraph("Factur\u00e9 \u00e0", heading_style))
	billed_lines = [f"<b>{billed_to['name']}</b>"]
	if billed_to.get("address"):
		billed_lines.append(billed_to["address"].replace("\n", "<br/>"))
	if billed_to.get("email"):
		billed_lines.append(billed_to["email"])
	elements.append(Paragraph("<br/>".join(billed_lines), body_style))
	elements.append(Spacer(1, 4 * mm))

	elements.append(Paragraph("D\u00e9tails de la location", heading_style))
	elements.append(_info_table([
		("R\u00e9f\u00e9rence de r\u00e9servation", reservation.reference),
		("V\u00e9hicule", f"{reservation.vehicle.brand} {reservation.vehicle.model_name}".strip()),
		("Date et heure de d\u00e9part", format_french_datetime(reservation.start_at)),
		("Date et heure de retour", format_french_datetime(reservation.end_at)),
		("Dur\u00e9e de location", format_french_duration(reservation.duration)),
		("Assurance choisie", reservation.get_insurance_type_display()),
	]))
	elements.append(Spacer(1, 4 * mm))

	elements.append(Paragraph("D\u00e9tails financiers", heading_style))
	financial_rows = [
		[Paragraph(item["label"], cell_value_style), Paragraph(item["amount_display"], amount_style)]
		for item in financial["line_items"]
	]
	financial_rows.append([Paragraph("Sous-total HTVA", cell_value_style), Paragraph(financial["subtotal_display"], amount_style)])
	financial_rows.append([Paragraph(f"TVA ({financial['tax_rate_display']})", cell_value_style), Paragraph(financial["tax_amount_display"], amount_style)])
	financial_rows.append([Paragraph("Total TVAC", total_label_style), Paragraph(financial["total_display"], total_value_style)])
	financial_table = Table(financial_rows, colWidths=[130 * mm, 44 * mm])
	financial_table.setStyle(TableStyle([
		("GRID", (0, 0), (-1, -2), 0.6, border_grey),
		("BACKGROUND", (0, -1), (-1, -1), brand_dark_blue),
		("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
		("LEFTPADDING", (0, 0), (-1, -1), 5),
		("RIGHTPADDING", (0, 0), (-1, -1), 5),
		("TOPPADDING", (0, 0), (-1, -1), 2),
		("BOTTOMPADDING", (0, 0), (-1, -1), 2),
		("TOPPADDING", (0, -1), (-1, -1), 5),
		("BOTTOMPADDING", (0, -1), (-1, -1), 5),
	]))
	elements.append(financial_table)
	elements.append(Spacer(1, 4 * mm))

	elements.append(Paragraph("Paiement", heading_style))
	payment = financial["payment"]
	if payment["available"]:
		payment_rows = [
			("Statut du paiement", payment["status"]),
			("Date du paiement", payment["date"]),
			("Moyen de paiement", payment["method"]),
		]
		if payment.get("reference"):
			payment_rows.append(("R\u00e9f\u00e9rence du paiement", payment["reference"]))
		elements.append(_info_table(payment_rows))
	else:
		elements.append(Paragraph("Aucune information de paiement disponible dans le backend pour cette facture.", muted_style))
	elements.append(Spacer(1, 4 * mm))

	elements.append(Paragraph("Caution", heading_style))
	deposit = financial["deposit"]
	deposit_rows = [("Caution", deposit["amount_display"])]
	if deposit["available"] and deposit.get("status"):
		deposit_rows.append(("Statut de la caution", deposit["status"]))
	if deposit["available"] and deposit.get("date"):
		deposit_rows.append(("Date de la caution", deposit["date"]))
	if deposit["available"] and deposit.get("reference"):
		deposit_rows.append(("R\u00e9f\u00e9rence de la caution", deposit["reference"]))
	elements.append(_info_table(deposit_rows))
	elements.append(Spacer(1, 2 * mm))
	elements.append(Paragraph("La caution est une pr\u00e9autorisation et n\u2019est pas comprise dans le total pay\u00e9.", note_style))

	buffer = BytesIO()
	doc = SimpleDocTemplate(
		buffer,
		pagesize=A4,
		topMargin=12 * mm,
		bottomMargin=18 * mm,
		leftMargin=15 * mm,
		rightMargin=15 * mm,
		title=f"Facture {invoice.number}",
	)
	doc.build(elements, onFirstPage=_invoice_pdf_footer, onLaterPages=_invoice_pdf_footer)
	return buffer.getvalue()


def ensure_invoice_pdf(invoice: Invoice) -> Invoice:
	"""Generate and persist PDF file if missing, then return the invoice."""
	if invoice.pdf_file:
		return invoice

	pdf_bytes = build_invoice_pdf(invoice)
	filename = f"{invoice.number}.pdf"
	invoice.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
	return invoice
