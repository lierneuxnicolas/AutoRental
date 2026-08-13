import secrets
import string
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import Q
from django.utils import timezone


REFERENCE_PREFIX = "AR"
REFERENCE_RANDOM_ALPHABET = string.ascii_uppercase + string.digits
REFERENCE_RANDOM_LENGTH = 8
REFERENCE_GENERATION_MAX_ATTEMPTS = 10


class Reservation(models.Model):
	class InsuranceType(models.TextChoices):
		STANDARD = "STANDARD", "Standard"
		DUO = "DUO", "Duo"
		OMNIUM = "OMNIUM", "Omnium"

	class Status(models.TextChoices):
		BROUILLON = "BROUILLON", "Brouillon"
		EN_ATTENTE_CAUTION = "EN_ATTENTE_CAUTION", "En attente caution"
		EN_ATTENTE_PAIEMENT = "EN_ATTENTE_PAIEMENT", "En attente paiement"
		CONFIRMEE = "CONFIRMEE", "Confirmee"
		EN_COURS = "EN_COURS", "En cours"
		A_CONTROLER = "A_CONTROLER", "A controler"
		TERMINEE = "TERMINEE", "Terminee"
		ANNULEE = "ANNULEE", "Annulee"
		PAIEMENT_ECHOUE = "PAIEMENT_ECHOUE", "Paiement echoue"

	REFERENCE_HELP_TEXT = "Reference generee automatiquement par le backend."
	ACTIVE_BOOKING_STATUSES = {
		Status.EN_ATTENTE_CAUTION,
		Status.EN_ATTENTE_PAIEMENT,
		Status.CONFIRMEE,
		Status.EN_COURS,
		Status.A_CONTROLER,
	}
	CONFIRMED_STATUSES = {
		Status.CONFIRMEE,
		Status.EN_COURS,
		Status.A_CONTROLER,
		Status.TERMINEE,
	}
	PRE_CONFIRMATION_STATUSES = {
		Status.BROUILLON,
		Status.EN_ATTENTE_CAUTION,
		Status.EN_ATTENTE_PAIEMENT,
		Status.PAIEMENT_ECHOUE,
	}

	client = models.ForeignKey(
		"accounts.ClientProfile",
		on_delete=models.PROTECT,
		related_name="reservations",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.PROTECT,
		related_name="reservations",
	)
	reference = models.CharField(
		max_length=16,
		unique=True,
		editable=False,
		help_text=REFERENCE_HELP_TEXT,
	)
	start_at = models.DateTimeField()
	end_at = models.DateTimeField()
	status = models.CharField(max_length=24, choices=Status.choices, default=Status.BROUILLON)
	rental_amount = models.DecimalField(
		max_digits=10,
		decimal_places=2,
		default=Decimal("0.00"),
	)
	insurance_type = models.CharField(
		max_length=20,
		choices=InsuranceType.choices,
		default=InsuranceType.STANDARD,
	)
	deposit_amount = models.DecimalField(
		max_digits=10,
		decimal_places=2,
		default=Decimal("0.00"),
	)
	confirmed_at = models.DateTimeField(null=True, blank=True)
	cancelled_at = models.DateTimeField(null=True, blank=True)
	cancellation_reason = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["client", "status"], name="reservation_client_status_idx"),
			models.Index(fields=["vehicle", "status"], name="reservation_vehicle_status_idx"),
			models.Index(fields=["start_at", "end_at"], name="reservation_period_idx"),
			models.Index(fields=["created_at"], name="reservation_created_at_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(end_at__gt=models.F("start_at")),
				name="reservation_end_after_start",
			),
			models.CheckConstraint(
				condition=Q(rental_amount__gte=0),
				name="reservation_rental_amount_non_negative",
			),
			models.CheckConstraint(
				condition=Q(deposit_amount__gte=0),
				name="reservation_deposit_amount_non_negative",
			),
		]

	def __str__(self) -> str:
		return self.reference

	@classmethod
	def generate_reference(cls) -> str:
		year = timezone.localdate().year
		random_part = "".join(secrets.choice(REFERENCE_RANDOM_ALPHABET) for _ in range(REFERENCE_RANDOM_LENGTH))
		return f"{REFERENCE_PREFIX}-{year}-{random_part}"

	@property
	def is_cancelled(self) -> bool:
		return self.status == self.Status.ANNULEE

	@property
	def is_active_booking(self) -> bool:
		return self.status in self.ACTIVE_BOOKING_STATUSES

	@property
	def duration(self) -> timedelta:
		return self.end_at - self.start_at

	def clean(self):
		super().clean()

		if self.end_at and self.start_at and self.end_at <= self.start_at:
			raise ValidationError({"end_at": "La date de fin doit etre strictement apres la date de debut."})

		if self.rental_amount is not None and self.rental_amount < 0:
			raise ValidationError({"rental_amount": "Le montant de location ne peut pas etre negatif."})

		if self.insurance_type not in {value for value, _ in self.InsuranceType.choices}:
			raise ValidationError({"insurance_type": "Le type d'assurance est invalide."})

		if self.deposit_amount is not None and self.deposit_amount < 0:
			raise ValidationError({"deposit_amount": "Le montant de caution ne peut pas etre negatif."})

		if self.cancellation_reason:
			self.cancellation_reason = " ".join(self.cancellation_reason.split())

		if self.status in self.CONFIRMED_STATUSES and self.confirmed_at is None:
			raise ValidationError({"confirmed_at": "Une reservation confirmee doit avoir une date de confirmation."})

		if self.status in self.PRE_CONFIRMATION_STATUSES and self.confirmed_at is not None:
			raise ValidationError({"confirmed_at": "La date de confirmation n'est pas autorisee pour ce statut."})

		if self.status == self.Status.ANNULEE:
			if self.cancelled_at is None:
				raise ValidationError({"cancelled_at": "Une reservation annulee doit avoir une date d'annulation."})
			if not self.cancellation_reason:
				raise ValidationError({"cancellation_reason": "Le motif d'annulation est obligatoire pour une reservation annulee."})
		elif self.cancelled_at is not None:
			raise ValidationError({"cancelled_at": "La date d'annulation est reservee au statut ANNULEE."})
		elif self.cancellation_reason:
			raise ValidationError(
				{"cancellation_reason": "Le motif d'annulation doit rester vide tant que la reservation n'est pas annulee."}
			)

	def save(self, *args, **kwargs):
		if self.pk:
			original_reference = type(self).objects.filter(pk=self.pk).values_list("reference", flat=True).first()
			if original_reference and self.reference != original_reference:
				raise ValidationError({"reference": "La reference d'une reservation ne peut pas etre modifiee."})

		attempts = REFERENCE_GENERATION_MAX_ATTEMPTS if self._state.adding else 1
		for attempt in range(attempts):
			if self._state.adding:
				self.reference = self.generate_reference()

			self.full_clean()

			try:
				with transaction.atomic():
					return super().save(*args, **kwargs)
			except IntegrityError:
				if not self._state.adding or attempt == attempts - 1:
					raise

		raise IntegrityError("Impossible de generer une reference de reservation unique.")
