from __future__ import annotations

from django.core.files.base import ContentFile
from django.template.loader import render_to_string

from invoicing.models import Invoice


def build_invoice_pdf(invoice: Invoice) -> bytes:
	"""Build the PDF bytes for an invoice using the HTML template."""
	context = {
		"invoice": invoice,
		"lines": invoice.lines.all(),
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
