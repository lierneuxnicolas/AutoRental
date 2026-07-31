from django.conf import settings
from django.db import models


class Notification(models.Model):
	user = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.CASCADE,
		related_name="notifications",
	)
	notification_type = models.CharField(max_length=50)
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
			models.Index(fields=["user"], name="notif_user_idx"),
			models.Index(fields=["is_read"], name="notif_is_read_idx"),
			models.Index(fields=["created_at"], name="notif_created_at_idx"),
		]

	def __str__(self) -> str:
		return f"{self.title} ({self.notification_type})"
