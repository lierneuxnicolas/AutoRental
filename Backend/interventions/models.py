import json
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class Intervention(models.Model):
	class Type(models.TextChoices):
		MECANIQUE = "MECANIQUE", "Mecanique"
		NETTOYAGE = "NETTOYAGE", "Nettoyage"

	class Status(models.TextChoices):
		A_ATTRIBUER = "A_ATTRIBUER", "A attribuer"
		ATTRIBUEE = "ATTRIBUEE", "Attribuee"
		EN_COURS = "EN_COURS", "En cours"
		TERMINEE = "TERMINEE", "Terminee"
		ANNULEE = "ANNULEE", "Annulee"

	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="interventions",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.PROTECT,
		related_name="interventions",
	)
	assigned_to = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="assigned_interventions",
	)
	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name="created_interventions",
	)
	inspection = models.ForeignKey(
		"inspections.Inspection",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="interventions",
	)

	reference = models.CharField(max_length=40, unique=True)
	intervention_type = models.CharField(max_length=20, choices=Type.choices)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.A_ATTRIBUER)
	description = models.TextField(blank=True)
	report = models.TextField(blank=True)
	estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
	final_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
	started_at = models.DateTimeField(null=True, blank=True)
	completed_at = models.DateTimeField(null=True, blank=True)
	cancelled_at = models.DateTimeField(null=True, blank=True)
	cancellation_reason = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["reference"], name="interv_reference_idx"),
			models.Index(fields=["status"], name="interv_status_idx"),
			models.Index(fields=["intervention_type"], name="interv_type_idx"),
			models.Index(fields=["vehicle", "status"], name="interv_vehicle_status_idx"),
			models.Index(fields=["assigned_to", "status"], name="interv_assignee_status_idx"),
			models.Index(fields=["reservation"], name="interv_reservation_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(estimated_cost__gte=0) | Q(estimated_cost__isnull=True),
				name="interv_estimated_cost_gte_0",
			),
			models.CheckConstraint(
				condition=Q(final_cost__gte=0) | Q(final_cost__isnull=True),
				name="interv_final_cost_gte_0",
			),
			models.CheckConstraint(
				condition=Q(completed_at__isnull=True) | Q(status="TERMINEE"),
				name="interv_completed_at_only_done",
			),
			models.CheckConstraint(
				condition=(
					Q(status__in=["A_ATTRIBUER", "ATTRIBUEE", "ANNULEE"], started_at__isnull=True)
					| Q(status__in=["EN_COURS", "TERMINEE"], started_at__isnull=False)
				),
				name="interv_started_at_only_in_progress",
			),
			models.CheckConstraint(
				condition=Q(status="A_ATTRIBUER") | Q(assigned_to__isnull=False),
				name="interv_assigned_required_unless_to_assign",
			),
		]

	def clean(self):
		super().clean()

		if self.created_by_id:
			role_code = getattr(getattr(self.created_by, "role", None), "code", None)
			if role_code != "GESTIONNAIRE_COMPTABLE":
				raise ValidationError({"created_by": "Le createur doit avoir le role GESTIONNAIRE_COMPTABLE."})

		if self.assigned_to_id:
			assigned_role = getattr(getattr(self.assigned_to, "role", None), "code", None)
			expected_role = "MECANICIEN" if self.intervention_type == self.Type.MECANIQUE else "NETTOYEUR"
			if assigned_role != expected_role:
				raise ValidationError(
					{"assigned_to": f"Le role assigne doit etre {expected_role} pour ce type d'intervention."}
				)

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"Intervention<{self.reference}:{self.status}>"


class TechnicalInspection(models.Model):
	intervention = models.ForeignKey(
		Intervention,
		on_delete=models.CASCADE,
		related_name="technical_inspections",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.PROTECT,
		related_name="technical_inspections",
	)
	mileage = models.PositiveIntegerField()
	energy_level_percent = models.PositiveSmallIntegerField()
	observations = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["intervention"], name="tech_insp_intervention_idx"),
			models.Index(fields=["vehicle"], name="tech_insp_vehicle_idx"),
			models.Index(fields=["created_at"], name="tech_insp_created_at_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(mileage__gte=0),
				name="tech_insp_mileage_gte_0",
			),
			models.CheckConstraint(
				condition=Q(energy_level_percent__gte=0) & Q(energy_level_percent__lte=100),
				name="tech_insp_energy_0_100",
			),
		]

	def __str__(self) -> str:
		return f"TechnicalInspection #{self.pk}"


class TechnicalPhoto(models.Model):
	technical_inspection = models.ForeignKey(
		TechnicalInspection,
		on_delete=models.CASCADE,
		related_name="photos",
	)
	file = models.ImageField(upload_to="technical_inspections/photos/")
	caption = models.CharField(max_length=255, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["technical_inspection"], name="tech_photo_insp_idx"),
			models.Index(fields=["created_at"], name="tech_photo_created_at_idx"),
		]

	def __str__(self) -> str:
		return f"TechnicalPhoto #{self.pk}"


class VehicleAccess(models.Model):
	class Status(models.TextChoices):
		PENDING = "PENDING", "Pending"
		ACTIVE = "ACTIVE", "Active"
		REVOKED = "REVOKED", "Revoked"
		EXPIRED = "EXPIRED", "Expired"

	class LockState(models.TextChoices):
		LOCKED = "LOCKED", "Locked"
		UNLOCKED = "UNLOCKED", "Unlocked"

	reservation = models.OneToOneField(
		"reservations.Reservation",
		on_delete=models.PROTECT,
		related_name="vehicle_access",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.PROTECT,
		related_name="access_records",
	)
	client = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name="vehicle_accesses",
	)
	status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
	lock_state = models.CharField(max_length=16, choices=LockState.choices, default=LockState.LOCKED)
	valid_from = models.DateTimeField()
	valid_until = models.DateTimeField()
	activated_at = models.DateTimeField(null=True, blank=True)
	revoked_at = models.DateTimeField(null=True, blank=True)
	last_unlocked_at = models.DateTimeField(null=True, blank=True)
	last_locked_at = models.DateTimeField(null=True, blank=True)
	is_active = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["status"], name="veh_access_status_idx"),
			models.Index(fields=["is_active"], name="veh_access_is_active_idx"),
			models.Index(fields=["valid_from"], name="veh_access_valid_from_idx"),
			models.Index(fields=["valid_until"], name="veh_access_valid_until_idx"),
			models.Index(fields=["vehicle", "is_active"], name="veh_access_vehicle_active_idx"),
		]

	def clean(self):
		super().clean()

		if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
			raise ValidationError({"valid_until": "valid_until doit etre strictement superieur a valid_from."})

		if self.reservation_id and self.vehicle_id and self.reservation.vehicle_id != self.vehicle_id:
			raise ValidationError({"vehicle": "Le vehicule doit correspondre au vehicule de la reservation."})

		if self.reservation_id and self.client_id and self.reservation.client.user_id != self.client_id:
			raise ValidationError({"client": "Le client doit correspondre a reservation.client.user."})

		if self.status == self.Status.ACTIVE and not self.is_active:
			raise ValidationError({"is_active": "Un acces ACTIVE doit avoir is_active=True."})

		if self.status in {self.Status.REVOKED, self.Status.EXPIRED} and self.is_active:
			raise ValidationError({"is_active": "Un acces REVOKED ou EXPIRED ne peut pas rester actif."})

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"VehicleAccess<{self.reservation.reference}>"


class LockingLog(models.Model):
	class Action(models.TextChoices):
		UNLOCK = "UNLOCK", "Unlock"
		LOCK = "LOCK", "Lock"
		ACCESS_ACTIVATED = "ACCESS_ACTIVATED", "Access activated"
		ACCESS_REVOKED = "ACCESS_REVOKED", "Access revoked"

	class Result(models.TextChoices):
		SUCCESS = "SUCCESS", "Success"
		FAILURE = "FAILURE", "Failure"

	vehicle_access = models.ForeignKey(
		VehicleAccess,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="locking_logs",
	)
	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="locking_logs",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="locking_logs",
	)
	user = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="locking_logs",
	)
	action = models.CharField(max_length=24, choices=Action.choices)
	result = models.CharField(max_length=10, choices=Result.choices)
	failure_code = models.CharField(max_length=64, null=True, blank=True)
	failure_message = models.TextField(null=True, blank=True)
	attempted_reservation_id = models.PositiveBigIntegerField(null=True, blank=True)
	ip_address = models.GenericIPAddressField(null=True, blank=True)
	user_agent = models.CharField(max_length=512, null=True, blank=True)
	metadata = models.JSONField(default=dict, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	SENSITIVE_PATTERN = re.compile(
		r"(jwt|bearer\s+[a-z0-9\-_.]+|password|passwd|stripe[_-]?secret|pin|card[_-]?number|numero[_-]?carte)",
		re.IGNORECASE,
	)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["reservation", "created_at"], name="lock_log_res_created_idx"),
			models.Index(fields=["vehicle", "created_at"], name="lock_log_veh_created_idx"),
			models.Index(fields=["user", "created_at"], name="lock_log_user_created_idx"),
			models.Index(fields=["action", "result"], name="lock_log_action_result_idx"),
			models.Index(fields=["created_at"], name="lock_log_created_at_idx"),
		]

	def clean(self):
		super().clean()

		if self.failure_message and self.SENSITIVE_PATTERN.search(self.failure_message):
			raise ValidationError({"failure_message": "failure_message contient des informations sensibles interdites."})

		metadata_payload = json.dumps(self.metadata or {}, ensure_ascii=True)
		if self.SENSITIVE_PATTERN.search(metadata_payload):
			raise ValidationError({"metadata": "metadata contient des informations sensibles interdites."})

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"LockingLog<{self.action}:{self.result}>"
