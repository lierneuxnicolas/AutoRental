from __future__ import annotations

from django.apps import apps


class InvoiceCreationNotAvailable(RuntimeError):
    pass


def create_invoice_for_reservation(reservation):
    """Create or reuse an invoice for a reservation when the model exists.

    This is intentionally a narrow integration point. The complete invoice
    generation workflow remains blocked until an Invoice model exists.
    """

    try:
        invoice_model = apps.get_model("invoicing", "Invoice")
    except LookupError as exc:
        raise InvoiceCreationNotAvailable("Invoice model is not available yet.") from exc

    if invoice_model is None:
        raise InvoiceCreationNotAvailable("Invoice model is not available yet.")

    reservation_field = getattr(invoice_model, "_meta", None)
    if reservation_field is not None and any(field.name == "reservation" for field in invoice_model._meta.fields):
        invoice = invoice_model.objects.filter(reservation=reservation).first()
        if invoice is not None:
            return invoice

    raise InvoiceCreationNotAvailable("Invoice model exists but reservation integration is not implemented.")