from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from payments.models import Deposit
from reservations.models import Reservation, ReservationAdditionalCharge
from reservations.services.additional_charges import calculate_deposit_settlement
from reservations.tests import ReservationTestDataMixin


class ReservationAdditionalChargesManagementTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		super().setUp()
		self.api = APIClient()
		now = timezone.now()
		self.reservation = self._create_reservation(
			status=Reservation.Status.A_CONTROLER,
			start_at=now,
			end_at=now + timedelta(hours=24),
		)
		self.additional_charges_url = reverse(
			"reservations:management-reservation-additional-charges",
			kwargs={"pk": self.reservation.id},
		)
		self.detail_url = reverse("reservations:management-reservation-detail", kwargs={"pk": self.reservation.id})
		self.release_url = reverse("reservations:management-reservation-release-deposit", kwargs={"pk": self.reservation.id})

	def _payload(self, *, delay="0.00", fuel="0.00", mileage="0.00", damages="0.00", reasons=None):
		reasons = reasons or {}
		return {
			"charges": [
				{"charge_type": "RETARD", "amount": delay, "justification": reasons.get("RETARD", "")},
				{"charge_type": "CARBURANT", "amount": fuel, "justification": reasons.get("CARBURANT", "")},
				{"charge_type": "KILOMETRAGE", "amount": mileage, "justification": reasons.get("KILOMETRAGE", "")},
				{"charge_type": "DEGATS", "amount": damages, "justification": reasons.get("DEGATS", "")},
			]
		}

	def test_manager_can_save_zero_charges(self):
		self.api.force_authenticate(self.manager_user)

		response = self.api.post(self.additional_charges_url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.reservation.refresh_from_db()
		self.assertEqual(self.reservation.return_delay_fee, Decimal("0.00"))
		self.assertEqual(self.reservation.return_fuel_fee, Decimal("0.00"))
		self.assertEqual(
			ReservationAdditionalCharge.objects.filter(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
			).count(),
			4,
		)

	def test_manager_can_save_multiple_charges_and_persist_after_refresh(self):
		self.api.force_authenticate(self.manager_user)
		payload = self._payload(
			delay="40.00",
			fuel="20.00",
			mileage="30.50",
			damages="100.00",
			reasons={
				"RETARD": "Retour tardif constaté",
				"CARBURANT": "Réservoir insuffisant",
				"KILOMETRAGE": "Distance contractuelle dépassée",
				"DEGATS": "Rayure sur portière",
			},
		)

		response = self.api.post(self.additional_charges_url, payload, format="json")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		detail = self.api.get(self.detail_url)
		self.assertEqual(detail.status_code, status.HTTP_200_OK)
		self.assertEqual(
			len([item for item in detail.data["additional_charges"] if item["status"] == ReservationAdditionalCharge.Status.PROVISOIRE]),
			4,
		)

	def test_negative_or_invalid_amounts_are_rejected(self):
		self.api.force_authenticate(self.manager_user)
		negative_payload = self._payload(delay="-1.00")
		invalid_payload = self._payload(delay="10.999", reasons={"RETARD": "x"})

		negative_response = self.api.post(self.additional_charges_url, negative_payload, format="json")
		invalid_response = self.api.post(self.additional_charges_url, invalid_payload, format="json")

		self.assertEqual(negative_response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_missing_justification_is_rejected_when_amount_positive(self):
		self.api.force_authenticate(self.manager_user)

		response = self.api.post(self.additional_charges_url, self._payload(delay="10.00"), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_manager_permission_is_required(self):
		self.api.force_authenticate(self.client_user_1)

		response = self.api.post(self.additional_charges_url, self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_amount_above_deposit_is_saved_and_blocks_deposit_release(self):
		self.api.force_authenticate(self.manager_user)
		Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.SIMULATED,
			amount=Decimal("500.00"),
			currency="EUR",
			status=Deposit.Status.AUTORISEE,
			authorized_at=timezone.now(),
		)

		save_response = self.api.post(
			self.additional_charges_url,
			self._payload(damages="700.00", reasons={"DEGATS": "Dégâts majeurs"}),
			format="json",
		)
		release_response = self.api.post(self.release_url, {}, format="json")

		self.assertEqual(save_response.status_code, status.HTTP_200_OK)
		self.assertEqual(release_response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(release_response.data["code"], "ADDITIONAL_CHARGES_PENDING")

	def test_existing_legacy_confirmed_charges_are_readonly(self):
		self.api.force_authenticate(self.manager_user)
		self.reservation.return_charges_confirmed_at = timezone.now()
		self.reservation.return_charges_confirmed_by = self.manager_user
		self.reservation.save(update_fields=["return_charges_confirmed_at", "return_charges_confirmed_by", "updated_at"])

		response = self.api.post(
			self.additional_charges_url,
			self._payload(delay="5.00", reasons={"RETARD": "Historique"}),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
		self.assertEqual(response.data["code"], "CHARGES_READ_ONLY")

	def test_settled_deposit_blocks_new_fees_even_without_preexisting_charges(self):
		self.api.force_authenticate(self.manager_user)
		deposit = Deposit.objects.create(
			reservation=self.reservation,
			mode=Deposit.Mode.SIMULATED,
			amount=Decimal("500.00"),
			currency="EUR",
			status=Deposit.Status.LIBEREE,
		)
		payload = self._payload(damages="15.00", reasons={"DEGATS": "Rayure"})
		for deposit_status in (Deposit.Status.LIBEREE, Deposit.Status.CAPTUREE):
			with self.subTest(deposit_status=deposit_status):
				deposit.status = deposit_status
				deposit.save(update_fields=["status"])
				response = self.api.post(self.additional_charges_url, payload, format="json")
				self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
				self.assertEqual(response.data["code"], "DEPOSIT_ALREADY_SETTLED")
				self.assertFalse(self.reservation.additional_charges.exists())
				self.assertFalse(self.api.get(self.detail_url).data["return_charges_editable"])

	def test_updating_before_closure_reuses_same_provisional_rows(self):
		self.api.force_authenticate(self.manager_user)
		first = self.api.post(
			self.additional_charges_url,
			self._payload(delay="12.00", reasons={"RETARD": "Premier montant"}),
			format="json",
		)
		second = self.api.post(
			self.additional_charges_url,
			self._payload(delay="18.00", reasons={"RETARD": "Montant ajusté"}),
			format="json",
		)
		self.assertEqual(first.status_code, status.HTTP_200_OK)
		self.assertEqual(second.status_code, status.HTTP_200_OK)
		self.assertEqual(
			ReservationAdditionalCharge.objects.filter(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
			).count(),
			4,
		)
		self.assertEqual(
			ReservationAdditionalCharge.objects.get(
				reservation=self.reservation,
				status=ReservationAdditionalCharge.Status.PROVISOIRE,
				charge_type=ReservationAdditionalCharge.ChargeType.RETARD,
			).amount,
			Decimal("18.00"),
		)


class DepositSettlementCalculationTests(ReservationTestDataMixin, TestCase):
	def setUp(self):
		super().setUp()
		now = timezone.now()
		self.reservation = self._create_reservation(
			status=Reservation.Status.A_CONTROLER,
			start_at=now,
			end_at=now + timedelta(hours=24),
		)
		self.reservation.deposit_amount = Decimal("500.00")
		self.reservation.save(update_fields=["deposit_amount", "updated_at"])

	def _create_charge(self, charge_type, amount, *, charge_status=ReservationAdditionalCharge.Status.PROVISOIRE):
		return ReservationAdditionalCharge.objects.create(
			reservation=self.reservation,
			charge_type=charge_type,
			amount=Decimal(amount),
			justification="Constat documente" if Decimal(amount) > 0 else "",
			status=charge_status,
		)

	def test_settlement_matches_reference_example(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.RETARD, "30.00")
		self._create_charge(ReservationAdditionalCharge.ChargeType.CARBURANT, "0.00")
		self._create_charge(ReservationAdditionalCharge.ChargeType.KILOMETRAGE, "0.00")
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "80.50")

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.deposit_amount, Decimal("500.00"))
		self.assertEqual(settlement.charges_total, Decimal("110.50"))
		self.assertEqual(settlement.retained_amount, Decimal("110.50"))
		self.assertEqual(settlement.amount_to_release, Decimal("389.50"))
		self.assertEqual(settlement.over_deposit_amount, Decimal("0.00"))

	def test_settlement_amounts_are_decimals_and_never_negative(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "110.50")

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		for value in (
			settlement.deposit_amount,
			settlement.charges_total,
			settlement.retained_amount,
			settlement.amount_to_release,
			settlement.over_deposit_amount,
		):
			self.assertIsInstance(value, Decimal)
			self.assertGreaterEqual(value, Decimal("0.00"))

	def test_settlement_caps_retained_amount_at_deposit(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "600.00")

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.charges_total, Decimal("600.00"))
		self.assertEqual(settlement.retained_amount, Decimal("500.00"))
		self.assertEqual(settlement.amount_to_release, Decimal("0.00"))
		self.assertEqual(settlement.over_deposit_amount, Decimal("100.00"))

	def test_settlement_ignores_cancelled_and_validated_charges(self):
		self._create_charge(ReservationAdditionalCharge.ChargeType.RETARD, "20.00")
		self._create_charge(
			ReservationAdditionalCharge.ChargeType.RETARD,
			"999.00",
			charge_status=ReservationAdditionalCharge.Status.ANNULEE,
		)
		self._create_charge(
			ReservationAdditionalCharge.ChargeType.DEGATS,
			"250.00",
			charge_status=ReservationAdditionalCharge.Status.VALIDEE,
		)

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.charges_total, Decimal("20.00"))
		self.assertEqual(settlement.amount_to_release, Decimal("480.00"))

	def test_settlement_uses_legacy_confirmed_fees_when_no_provisional_rows(self):
		self.reservation.return_delay_fee = Decimal("30.00")
		self.reservation.return_fuel_fee = Decimal("20.50")
		self.reservation.return_charges_confirmed_at = timezone.now()
		self.reservation.save(
			update_fields=["return_delay_fee", "return_fuel_fee", "return_charges_confirmed_at", "updated_at"]
		)

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.charges_total, Decimal("50.50"))
		self.assertEqual(settlement.retained_amount, Decimal("50.50"))
		self.assertEqual(settlement.amount_to_release, Decimal("449.50"))

	def test_settlement_never_double_counts_legacy_fees_with_provisional_rows(self):
		self.reservation.return_delay_fee = Decimal("30.00")
		self.reservation.return_fuel_fee = Decimal("20.50")
		self.reservation.return_charges_confirmed_at = timezone.now()
		self.reservation.save(
			update_fields=["return_delay_fee", "return_fuel_fee", "return_charges_confirmed_at", "updated_at"]
		)
		self._create_charge(ReservationAdditionalCharge.ChargeType.RETARD, "30.00")
		self._create_charge(ReservationAdditionalCharge.ChargeType.CARBURANT, "20.50")

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.charges_total, Decimal("50.50"))

	def test_settlement_with_zero_charges_releases_full_deposit(self):
		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.charges_total, Decimal("0.00"))
		self.assertEqual(settlement.retained_amount, Decimal("0.00"))
		self.assertEqual(settlement.amount_to_release, Decimal("500.00"))
		self.assertEqual(settlement.over_deposit_amount, Decimal("0.00"))

	def test_settlement_with_missing_deposit_amount_stays_at_zero(self):
		self.reservation.deposit_amount = Decimal("0.00")
		self.reservation.save(update_fields=["deposit_amount", "updated_at"])
		self._create_charge(ReservationAdditionalCharge.ChargeType.DEGATS, "75.00")

		settlement = calculate_deposit_settlement(reservation=self.reservation)

		self.assertEqual(settlement.deposit_amount, Decimal("0.00"))
		self.assertEqual(settlement.retained_amount, Decimal("0.00"))
		self.assertEqual(settlement.amount_to_release, Decimal("0.00"))
		self.assertEqual(settlement.over_deposit_amount, Decimal("75.00"))
