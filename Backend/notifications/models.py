from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Notification(models.Model):
	class NotificationType(models.TextChoices):
		ACCOUNT_CREATED = "ACCOUNT_CREATED", "Account created"
		EMAIL_VERIFIED = "EMAIL_VERIFIED", "Email verified"
		DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED", "Document uploaded"
		DOCUMENT_VALIDATED = "DOCUMENT_VALIDATED", "Document validated"
		DOCUMENT_REJECTED = "DOCUMENT_REJECTED", "Document rejected"
		RESERVATION_DRAFT_CREATED = "RESERVATION_DRAFT_CREATED", "Reservation draft created"
		RESERVATION_CONFIRMED = "RESERVATION_CONFIRMED", "Reservation confirmed"
		RESERVATION_CANCELLED = "RESERVATION_CANCELLED", "Reservation cancelled"
		DEPOSIT_AUTHORIZED = "DEPOSIT_AUTHORIZED", "Deposit authorized"
		PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED", "Payment succeeded"
		PAYMENT_FAILED = "PAYMENT_FAILED", "Payment failed"
		DEPARTURE_INSPECTION_COMPLETED = "DEPARTURE_INSPECTION_COMPLETED", "Departure inspection completed"
		RETURN_INSPECTION_COMPLETED = "RETURN_INSPECTION_COMPLETED", "Return inspection completed"
		DAMAGE_REPORTED = "DAMAGE_REPORTED", "Damage reported"
		INTERVENTION_ASSIGNED = "INTERVENTION_ASSIGNED", "Intervention assigned"
		INTERVENTION_COMPLETED = "INTERVENTION_COMPLETED", "Intervention completed"
		INVOICE_AVAILABLE = "INVOICE_AVAILABLE", "Invoice available"
		VEHICLE_REQUIRES_REVIEW = "VEHICLE_REQUIRES_REVIEW", "Vehicle requires review"

		# Existing codes kept for backward compatibility with current services/tests.
		PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed"
		PAYMENT_CONFLICT = "PAYMENT_CONFLICT", "Payment conflict"
		PAYMENT_CANCELED = "PAYMENT_CANCELED", "Payment canceled"
		INTERVENTION_COMPLETED_REVIEW_REQUIRED = (
			"INTERVENTION_COMPLETED_REVIEW_REQUIRED",
			"Intervention completed (review required)",
		)

	user = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.CASCADE,
		related_name="notifications",
	)
	notification_type = models.CharField(
		max_length=50,
		choices=NotificationType.choices,
	)
	title = models.CharField(max_length=200)
	message = models.TextField()
	is_read = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)
	read_at = models.DateTimeField(null=True, blank=True)
	related_object_type = models.CharField(max_length=100, null=True, blank=True)
	related_object_id = models.PositiveBigIntegerField(null=True, blank=True)

	class Meta:
		ordering = ["-created_at"]
		indexes = [
			models.Index(fields=["user", "is_read", "created_at"], name="notif_user_read_created_idx"),
			models.Index(fields=["notification_type"], name="notif_type_idx"),
			models.Index(fields=["related_object_type", "related_object_id"], name="notif_related_obj_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=(Q(is_read=False, read_at__isnull=True) | Q(is_read=True, read_at__isnull=False)),
				name="notif_read_state_consistency",
			),
		]

	def __str__(self) -> str:
		email = getattr(self.user, "email", str(self.user))
		return f"{email} - {self.title}"

	def clean(self):
		super().clean()
		if not self.is_read and self.read_at is not None:
			self.read_at = None
		if self.is_read and self.read_at is None:
			self.read_at = timezone.now()

	def mark_as_read(self, *, save: bool = True):
		self.is_read = True
		if self.read_at is None:
			self.read_at = timezone.now()
		if save:
			self.save(update_fields=["is_read", "read_at"])

	def mark_as_unread(self, *, save: bool = True):
		self.is_read = False
		self.read_at = None
		if save:
			self.save(update_fields=["is_read", "read_at"])
