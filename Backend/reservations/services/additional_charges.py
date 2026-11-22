from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from payments.models import Deposit
from reservations.models import Reservation, ReservationAdditionalCharge


@dataclass(frozen=True)
class ReservationAdditionalChargesError(ValueError):
	code: str
	message: str
	http_status: int = 400

	def __str__(self) -> str:
		return self.message


def _raise_additional_charges_error(code: str, message: str, *, http_status: int = 400) -> None:
	raise ReservationAdditionalChargesError(code=code, message=message, http_status=http_status)


def _as_decimal(value) -> Decimal:
	if isinstance(value, Decimal):
		return value
	return Decimal(str(value))


def save_provisional_additional_charges(*, reservation: Reservation, requested_by, charges: list[dict]) -> Reservation:
	with transaction.atomic():
		locked = Reservation.objects.select_for_update().get(pk=reservation.pk)

		if locked.status != Reservation.Status.A_CONTROLER:
			_raise_additional_charges_error(
				"INVALID_STATUS",
				"La reservation doit etre en attente de controle pour enregistrer des frais provisoires.",
				http_status=409,
			)

		deposit = locked.deposits.order_by("-authorized_at", "-created_at", "-id").first()
		if deposit and deposit.status in {Deposit.Status.LIBEREE, Deposit.Status.CAPTUREE}:
			_raise_additional_charges_error(
				"DEPOSIT_ALREADY_SETTLED",
				"La caution a déjà été régularisée. Aucune nouvelle retenue n'est possible.",
				http_status=409,
			)

		existing = {
			charge.charge_type: charge
			for charge in ReservationAdditionalCharge.objects.select_for_update().filter(
				reservation=locked,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
			)
		}
		is_legacy_confirmed_without_provisional = locked.return_charges_confirmed_at is not None and not existing
		if is_legacy_confirmed_without_provisional:
			_raise_additional_charges_error(
				"CHARGES_READ_ONLY",
				"Les frais historiques deja confirmes sont en lecture seule.",
				http_status=409,
			)

		for item in charges:
			charge_type = item["charge_type"]
			amount = _as_decimal(item["amount"])
			justification = " ".join((item.get("justification") or "").split())
			charge = existing.get(charge_type)
			if charge is None:
				charge = ReservationAdditionalCharge(
					reservation=locked,
					charge_type=charge_type,
					status=ReservationAdditionalCharge.Status.PROVISOIRE,
					created_by=requested_by,
				)
			charge.amount = amount
			charge.justification = justification
			charge.created_by = requested_by
			charge.save()

		charge_map = {item["charge_type"]: _as_decimal(item["amount"]) for item in charges}
		locked.return_delay_fee = charge_map.get(ReservationAdditionalCharge.ChargeType.RETARD, Decimal("0.00"))
		locked.return_fuel_fee = charge_map.get(ReservationAdditionalCharge.ChargeType.CARBURANT, Decimal("0.00"))
		locked.return_charges_confirmed_at = timezone.now()
		locked.return_charges_confirmed_by = requested_by
		locked.save(
			update_fields=[
				"return_delay_fee",
				"return_fuel_fee",
				"return_charges_confirmed_at",
				"return_charges_confirmed_by",
				"updated_at",
			]
		)

	return locked


def get_positive_provisional_additional_charges_total(*, reservation: Reservation) -> Decimal:
	total = Decimal("0.00")
	for amount in ReservationAdditionalCharge.objects.filter(
		reservation=reservation,
		status=ReservationAdditionalCharge.Status.PROVISOIRE,
	).values_list("amount", flat=True):
		if amount and amount > 0:
			total += amount
	return total


TWO_DECIMAL_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class DepositSettlement:
	"""Montants de cloture calcules a partir de la caution et des frais supplementaires.

	Tous les montants sont des Decimal >= 0, quantifies a deux decimales.
	Aucune operation Stripe n'est effectuee ici.
	"""

	deposit_amount: Decimal
	charges_total: Decimal
	retained_amount: Decimal
	amount_to_release: Decimal
	over_deposit_amount: Decimal


def calculate_deposit_settlement(*, reservation: Reservation) -> DepositSettlement:
	"""Calcule retenue, solde a liberer et depassement eventuel de la caution.

	- Caution = montant reellement enregistre sur la reservation.
	- Frais = somme des frais provisoires actifs (une seule ligne PROVISOIRE par type
	  est garantie par le service d'enregistrement) ; les frais ANNULEE ou deja
	  VALIDEE ne sont jamais comptabilises.
	- Compatibilite historique : si aucune ligne provisoire n'existe mais que des
	  frais ont ete confirmes avant l'introduction des lignes detaillees
	  (return_charges_confirmed_at renseigne), return_delay_fee et return_fuel_fee
	  servent de total ; ils ne sont jamais additionnes aux lignes provisoires.
	"""
	deposit_amount = reservation.deposit_amount
	if deposit_amount is None or deposit_amount < 0:
		deposit_amount = Decimal("0.00")
	deposit_amount = _as_decimal(deposit_amount).quantize(TWO_DECIMAL_PLACES)

	charges_total = Decimal("0.00")
	has_provisional_rows = False
	for amount in ReservationAdditionalCharge.objects.filter(
		reservation=reservation,
		status=ReservationAdditionalCharge.Status.PROVISOIRE,
	).values_list("amount", flat=True):
		has_provisional_rows = True
		if amount and amount > 0:
			charges_total += amount

	if not has_provisional_rows and reservation.return_charges_confirmed_at is not None:
		for legacy_amount in (reservation.return_delay_fee, reservation.return_fuel_fee):
			if legacy_amount and legacy_amount > 0:
				charges_total += _as_decimal(legacy_amount)

	charges_total = charges_total.quantize(TWO_DECIMAL_PLACES)
	retained_amount = min(charges_total, deposit_amount)
	amount_to_release = deposit_amount - retained_amount
	over_deposit_amount = max(charges_total - deposit_amount, Decimal("0.00"))

	return DepositSettlement(
		deposit_amount=deposit_amount,
		charges_total=charges_total,
		retained_amount=retained_amount,
		amount_to_release=amount_to_release,
		over_deposit_amount=over_deposit_amount,
	)
