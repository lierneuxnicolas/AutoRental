from django.conf import settings
from django.db import models


class SystemLog(models.Model):
    class Level(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        ERROR = "ERROR", "Error"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="system_logs",
    )
    action = models.CharField(max_length=255)
    message = models.TextField()
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.INFO)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.level}: {self.action}"


class BackupRecord(models.Model):
    class Status(models.TextChoices):
        EN_COURS = "EN_COURS", "En cours"
        REUSSIE = "REUSSIE", "Reussie"
        ECHEC = "ECHEC", "Echec"

    class BackupType(models.TextChoices):
        DATABASE = "DATABASE", "Database"

    filename = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_COURS)
    backup_type = models.CharField(max_length=20, choices=BackupType.choices, default=BackupType.DATABASE)
    file_size = models.BigIntegerField(null=True, blank=True)
    file_path = models.TextField()
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.filename} ({self.status})"
