from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import ClientProfile
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Vehicle


class Command(BaseCommand):
	help = "Create a standalone demo reservation for inspection flows."

	def handle(self, *args: Any, **options: Any) -> None:
		now = timezone.now()
		start_at = now + timedelta(minutes=10)
		end_at = now + timedelta(hours=2)

		client = self._get_demo_client()
		vehicle = self._get_demo_vehicle()

		with transaction.atomic():
			reservation = Reservation.objects.create(
				client=client,
				vehicle=vehicle,
				start_at=start_at,
				end_at=end_at,
				status=Reservation.Status.CONFIRMEE,
				confirmed_at=now,
				rental_amount=Decimal("0.00"),
				deposit_amount=Decimal("0.00"),
			)

			payment = Payment.objects.create(
				reservation=reservation,
				amount=Decimal("0.00"),
				currency="EUR",
				status=Payment.Status.REUSSI,
				succeeded_at=now,
			)

			deposit = Deposit.objects.create(
				reservation=reservation,
				mode=Deposit.Mode.SIMULATED,
				amount=Decimal("0.00"),
				currency="EUR",
				status=Deposit.Status.AUTORISEE,
				authorized_at=now,
			)

		self.stdout.write(self.style.SUCCESS("Inspection demo reservation created."))
		self.stdout.write(f"reservation_id: {reservation.id}")
		self.stdout.write(f"reference: {reservation.reference}")
		self.stdout.write(f"start_at: {timezone.localtime(reservation.start_at).isoformat()}")
		self.stdout.write(f"end_at: {timezone.localtime(reservation.end_at).isoformat()}")
		self.stdout.write(f"reservation_status: {reservation.status}")
		self.stdout.write(f"payment_status: {payment.status}")
		self.stdout.write(f"deposit_status: {deposit.status}")

	def _get_demo_client(self) -> ClientProfile:
		try:
			return ClientProfile.objects.select_related("user").get(
				user__email="client.incomplete@autorental.local"
			)
		except ClientProfile.DoesNotExist as exc:
			raise CommandError(
				"ClientProfile for client.incomplete@autorental.local was not found. Run seed_demo first."
			) from exc

	def _get_demo_vehicle(self) -> Vehicle:
		try:
			return Vehicle.objects.get(pk=2)
		except Vehicle.DoesNotExist as exc:
			raise CommandError("Vehicle with id 2 was not found.") from exc