from __future__ import annotations

from decimal import Decimal

from django.apps import apps
from django.db import transaction

from invoicing.models import Invoice, InvoiceLine


class InvoiceCreationNotAvailable(RuntimeError):
    pass


def create_invoice_for_reservation(reservation):
    try:
        apps.get_model("invoicing", "Invoice")
    except LookupError as exc:
        raise InvoiceCreationNotAvailable("Invoice model is not available yet.") from exc

    reservation_client = getattr(reservation, "client", None)
    if reservation_client is None:
        raise InvoiceCreationNotAvailable("Reservation client is required to create invoice.")

    with transaction.atomic():
        invoice = Invoice.objects.filter(reservation=reservation).select_for_update().first()
        if invoice is not None:
            return invoice

        user = getattr(reservation_client, "user", None)
        first_name = getattr(user, "first_name", "") or ""
        last_name = getattr(user, "last_name", "") or ""
        billing_name = f"{first_name} {last_name}".strip() or getattr(user, "email", "Client")

        billing_address = (reservation_client.address or "Adresse non renseignee").strip()
        rental_amount = reservation.rental_amount or Decimal("0.00")
        tax_amount = Decimal("0.00")

        invoice = Invoice.objects.create(
            reservation=reservation,
            client=reservation_client,
            status=Invoice.Status.ISSUED,
            subtotal=rental_amount,
            tax_amount=tax_amount,
            total_amount=rental_amount + tax_amount,
            currency="EUR",
            billing_name=billing_name,
            billing_address=billing_address,
        )

        InvoiceLine.objects.create(
            invoice=invoice,
            line_type=InvoiceLine.LineType.VEHICLE_RENTAL,
            description="Location du vehicule",
            quantity=Decimal("1.00"),
            unit_price=rental_amount,
            total_price=rental_amount,
        )

        return invoice