from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Upper


class Payment(models.Model):
	class Provider(models.TextChoices):
		STRIPE = "STRIPE", "Stripe"

	class Status(models.TextChoices):
		CREE = "CREE", "Cree"
		EN_ATTENTE = "EN_ATTENTE", "En attente"
		ACTION_REQUISE = "ACTION_REQUISE", "Action requise"
		TRAITEMENT = "TRAITEMENT", "Traitement"
		REUSSI = "REUSSI", "Reussi"
		ECHOUE = "ECHOUE", "Echoue"
		ANNULE = "ANNULE", "Annule"

	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.CASCADE,
		related_name="payments",
	)
	provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.STRIPE)
	amount = models.DecimalField(max_digits=10, decimal_places=2)
	currency = models.CharField(max_length=3, default="EUR")
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREE, db_index=True)
	stripe_payment_intent_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
	failure_code = models.CharField(max_length=120, null=True, blank=True)
	failure_message = models.TextField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)
	succeeded_at = models.DateTimeField(null=True, blank=True)
	failed_at = models.DateTimeField(null=True, blank=True)
	cancelled_at = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ["-created_at"]
		indexes = [
			models.Index(fields=["reservation"], name="pay_reservation_idx"),
			models.Index(fields=["status"], name="pay_status_idx"),
			models.Index(fields=["stripe_payment_intent_id"], name="pay_pi_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(amount__gte=0), name="pay_amount_gte_0"),
			models.CheckConstraint(condition=Q(currency=Upper("currency")), name="pay_currency_upper"),
		]

	def __str__(self):
		return f"Payment #{self.pk} - {self.status} - {self.amount} {self.currency}"


class Deposit(models.Model):
	class Mode(models.TextChoices):
		SIMULATED = "SIMULATED", "Simulated"
		STRIPE_TEST = "STRIPE_TEST", "Stripe test"

	class Status(models.TextChoices):
		CREE = "CREE", "Cree"
		EN_ATTENTE = "EN_ATTENTE", "En attente"
		AUTORISEE = "AUTORISEE", "Autorisee"
		A_VERIFIER = "A_VERIFIER", "A verifier"
		CAPTUREE = "CAPTUREE", "Capturee"
		LIBEREE = "LIBEREE", "Liberee"
		ECHOUEE = "ECHOUEE", "Echouee"
		ANNULEE = "ANNULEE", "Annulee"
		EXPIREE = "EXPIREE", "Expiree"

	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.CASCADE,
		related_name="deposits",
	)
	mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.SIMULATED)
	amount = models.DecimalField(max_digits=10, decimal_places=2)
	currency = models.CharField(max_length=3, default="EUR")
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREE, db_index=True)
	stripe_payment_intent_id = models.CharField(max_length=255, null=True, blank=True)
	authorization_expires_at = models.DateTimeField(null=True, blank=True)
	authorized_at = models.DateTimeField(null=True, blank=True)
	captured_at = models.DateTimeField(null=True, blank=True)
	released_at = models.DateTimeField(null=True, blank=True)
	failed_at = models.DateTimeField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]
		indexes = [
			models.Index(fields=["reservation"], name="dep_reservation_idx"),
			models.Index(fields=["status"], name="dep_status_idx"),
			models.Index(fields=["stripe_payment_intent_id"], name="dep_pi_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(amount__gte=0), name="dep_amount_gte_0"),
			models.CheckConstraint(condition=Q(currency=Upper("currency")), name="dep_currency_upper"),
		]

	def __str__(self):
		return f"Deposit #{self.pk} - {self.status} - {self.amount} {self.currency}"


class StripeEvent(models.Model):
	stripe_event_id = models.CharField(max_length=255, unique=True)
	event_type = models.CharField(max_length=255, db_index=True)
	api_version = models.CharField(max_length=50, null=True, blank=True)
	payload = models.JSONField()
	processed = models.BooleanField(default=False, db_index=True)
	processed_at = models.DateTimeField(null=True, blank=True)
	processing_error = models.TextField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True, db_index=True)

	class Meta:
		ordering = ["-created_at"]
		indexes = [
			models.Index(fields=["stripe_event_id"], name="se_event_id_idx"),
			models.Index(fields=["event_type"], name="se_type_idx"),
			models.Index(fields=["processed"], name="se_processed_idx"),
			models.Index(fields=["created_at"], name="se_created_idx"),
		]

	def __str__(self):
		return f"StripeEvent {self.stripe_event_id} ({self.event_type})"


class Refund(models.Model):
	class Status(models.TextChoices):
		DEMANDE = "DEMANDE", "Demande"
		EN_COURS = "EN_COURS", "En cours"
		REUSSI = "REUSSI", "Reussi"
		ECHOUE = "ECHOUE", "Echoue"
		ANNULE = "ANNULE", "Annule"

	payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="refunds")
	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="refunds",
	)
	amount = models.DecimalField(max_digits=10, decimal_places=2)
	currency = models.CharField(max_length=3, default="EUR")
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DEMANDE, db_index=True)
	stripe_refund_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
	reason = models.TextField(null=True, blank=True)
	requested_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="requested_refunds",
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)
	succeeded_at = models.DateTimeField(null=True, blank=True)
	failed_at = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ["-created_at"]
		indexes = [
			models.Index(fields=["payment"], name="ref_payment_idx"),
			models.Index(fields=["reservation"], name="ref_reservation_idx"),
			models.Index(fields=["status"], name="ref_status_idx"),
			models.Index(fields=["stripe_refund_id"], name="ref_stripe_id_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(amount__gte=0), name="ref_amount_gte_0"),
			models.CheckConstraint(condition=Q(currency=Upper("currency")), name="ref_currency_upper"),
		]

	def __str__(self):
		return f"Refund #{self.pk} - {self.status} - {self.amount} {self.currency}"
