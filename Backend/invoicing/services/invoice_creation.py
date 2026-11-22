from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.apps import apps
from django.db import transaction

from invoicing.models import Invoice, InvoiceLine


VAT_RATE = Decimal("0.21")
_TWO_PLACES = Decimal("0.01")

# Qualification TVA des frais supplementaires :
# - retard, carburant, kilometres : prestations accessoires a la location -> TVAC 21 %.
# - degats : indemnite compensatoire -> hors champ TVA (qualification a confirmer juridiquement).
TAXABLE_ADDITIONAL_CHARGE_TYPES = {"RETARD", "CARBURANT", "KILOMETRAGE"}


def split_tvac_amount(tvac_amount: Decimal) -> tuple[Decimal, Decimal]:
    """Ventile un montant TVAC 21 % : HTVA = TVAC / 1,21 ; TVA = TVAC - HTVA.

    Arrondi a deux decimales (ROUND_HALF_UP) ; HTVA + TVA == TVAC exactement.
    """
    tvac = Decimal(tvac_amount).quantize(_TWO_PLACES)
    htva = (tvac / (Decimal("1") + VAT_RATE)).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)
    return htva, tvac - htva


class InvoiceCreationNotAvailable(RuntimeError):
    pass


def create_invoice_for_reservation(reservation, *, invoice_type: str = "LOCATION"):
    try:
        apps.get_model("invoicing", "Invoice")
    except LookupError as exc:
        raise InvoiceCreationNotAvailable("Invoice model is not available yet.") from exc

    reservation_client = getattr(reservation, "client", None)
    if reservation_client is None:
        raise InvoiceCreationNotAvailable("Reservation client is required to create invoice.")

    with transaction.atomic():
        invoice = (
            Invoice.objects.filter(reservation=reservation, invoice_type=invoice_type)
            .select_for_update()
            .first()
        )
        if invoice is not None:
            return invoice

        user = getattr(reservation_client, "user", None)
        first_name = getattr(user, "first_name", "") or ""
        last_name = getattr(user, "last_name", "") or ""
        billing_name = f"{first_name} {last_name}".strip() or getattr(user, "email", "Client")

        billing_address = (reservation_client.address or "Adresse non renseignee").strip()
        rental_amount = reservation.rental_amount or Decimal("0.00")
        if invoice_type == Invoice.InvoiceType.LOCATION:
            # Le montant de location est TVAC (21 % compris) : ventilation HTVA / TVA.
            subtotal, tax_amount = split_tvac_amount(rental_amount)
        else:
            # Document d'annulation : montant conserve = indemnite hors champ TVA.
            subtotal, tax_amount = rental_amount, Decimal("0.00")

        invoice = Invoice.objects.create(
            reservation=reservation,
            client=reservation_client,
            invoice_type=invoice_type,
            status=Invoice.Status.ISSUED,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=subtotal + tax_amount,
            currency="EUR",
            billing_name=billing_name,
            billing_address=billing_address,
        )

        InvoiceLine.objects.create(
            invoice=invoice,
            line_type=InvoiceLine.LineType.VEHICLE_RENTAL,
            description="Location du vehicule",
            quantity=Decimal("1.00"),
            unit_price=subtotal,
            total_price=subtotal,
        )

        return invoice


ADDITIONAL_CHARGE_LABELS = {
    "RETARD": "Retard",
    "CARBURANT": "Carburant manquant",
    "KILOMETRAGE": "Kilomètres supplémentaires",
    "DEGATS": "Dégâts (indemnité hors TVA)",
}

ADDITIONAL_CHARGE_LINE_TYPES = {
    "RETARD": InvoiceLine.LineType.DELAY,
    "CARBURANT": InvoiceLine.LineType.FINE,
    "KILOMETRAGE": InvoiceLine.LineType.FINE,
    "DEGATS": InvoiceLine.LineType.DAMAGE,
}


def _build_billing_fields(reservation_client) -> tuple[str, str]:
    user = getattr(reservation_client, "user", None)
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    billing_name = f"{first_name} {last_name}".strip() or getattr(user, "email", "Client")
    billing_address = (reservation_client.address or "Adresse non renseignee").strip()
    return billing_name, billing_address


def create_additional_charges_invoice(reservation):
    """Cree (ou retourne) la facture COMPLEMENTAIRE des frais valides d'une reservation.

    Conditions : frais VALIDEE au total > 0 et regularisation de caution confirmee
    (caution CAPTUREE ou LIBEREE). La facture porte sur le total des frais, meme
    au-dela de la caution ; la retenue reelle et le restant du sont affiches dans
    le PDF a partir de Deposit.captured_amount. Aucune operation Stripe ici.
    """
    from payments.models import Deposit
    from reservations.models import ReservationAdditionalCharge

    reservation_client = getattr(reservation, "client", None)
    if reservation_client is None:
        raise InvoiceCreationNotAvailable("Reservation client is required to create invoice.")

    charges = list(
        ReservationAdditionalCharge.objects.filter(
            reservation=reservation,
            status=ReservationAdditionalCharge.Status.VALIDEE,
            amount__gt=0,
        ).order_by("charge_type", "id")
    )
    charges_total = sum((charge.amount for charge in charges), Decimal("0.00"))
    if not charges or charges_total <= 0:
        return None

    with transaction.atomic():
        existing = (
            Invoice.objects.filter(reservation=reservation, invoice_type=Invoice.InvoiceType.COMPLEMENTAIRE)
            .select_for_update()
            .first()
        )
        if existing is not None:
            return existing

        deposit = (
            Deposit.objects.select_for_update()
            .filter(reservation=reservation)
            .order_by("-authorized_at", "-created_at", "-id")
            .first()
        )
        if deposit is None or deposit.status not in {Deposit.Status.CAPTUREE, Deposit.Status.LIBEREE}:
            raise InvoiceCreationNotAvailable(
                "La regularisation de la caution doit etre confirmee avant la facture complementaire."
            )
        if deposit.status == Deposit.Status.CAPTUREE and deposit.captured_amount is None:
            raise InvoiceCreationNotAvailable(
                "Le montant reellement capture est inconnu ; une verification manuelle est requise."
            )

        billing_name, billing_address = _build_billing_fields(reservation_client)

        # Ventilation TVA : frais taxables TVAC 21 % ; degats = indemnite hors TVA.
        # Le total TVAC facture reste exactement la somme des frais valides.
        subtotal = Decimal("0.00")
        tax_amount = Decimal("0.00")
        for charge in charges:
            if charge.charge_type in TAXABLE_ADDITIONAL_CHARGE_TYPES:
                charge_htva, charge_tva = split_tvac_amount(charge.amount)
                subtotal += charge_htva
                tax_amount += charge_tva
            else:
                subtotal += charge.amount

        invoice = Invoice.objects.create(
            reservation=reservation,
            client=reservation_client,
            invoice_type=Invoice.InvoiceType.COMPLEMENTAIRE,
            status=Invoice.Status.ISSUED,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=subtotal + tax_amount,
            currency="EUR",
            billing_name=billing_name,
            billing_address=billing_address,
        )

        for charge in charges:
            label = ADDITIONAL_CHARGE_LABELS.get(charge.charge_type, charge.charge_type)
            justification = (charge.justification or "").strip()
            description = f"{label} — {justification}" if justification else label
            InvoiceLine.objects.create(
                invoice=invoice,
                line_type=ADDITIONAL_CHARGE_LINE_TYPES.get(charge.charge_type, InvoiceLine.LineType.FINE),
                description=description[:255],
                quantity=Decimal("1.00"),
                unit_price=charge.amount,
                total_price=charge.amount,
            )

        return invoice