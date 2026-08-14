from django.conf import settings
from django.db import models
from django.db.models import Q


class Inspection(models.Model):
	class Type(models.TextChoices):
		INITIAL = "INITIAL", "Initial"
		FINAL = "FINAL", "Final"

	class Status(models.TextChoices):
		BROUILLON = "BROUILLON", "Brouillon"
		EN_COURS = "EN_COURS", "En cours"
		TERMINE = "TERMINE", "Termine"
		ANNULE = "ANNULE", "Annule"

	reservation = models.ForeignKey(
		"reservations.Reservation",
		on_delete=models.CASCADE,
		related_name="inspections",
	)
	completed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="completed_inspections",
	)

	inspection_type = models.CharField(max_length=20, choices=Type.choices)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.BROUILLON, db_index=True)
	mileage = models.PositiveIntegerField(null=True, blank=True)
	energy_level_percent = models.PositiveSmallIntegerField(null=True, blank=True)
	comments = models.TextField(blank=True)
	has_critical_issue = models.BooleanField(default=False)
	critical_issue_description = models.TextField(blank=True)
	started_at = models.DateTimeField(null=True, blank=True)
	completed_at = models.DateTimeField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["reservation"], name="insp_reservation_idx"),
			models.Index(fields=["status"], name="insp_status_idx"),
			models.Index(fields=["inspection_type"], name="insp_type_idx"),
		]
		constraints = [
			models.UniqueConstraint(
				fields=["reservation", "inspection_type"],
				name="insp_unique_reservation_type",
			),
			models.CheckConstraint(
				condition=Q(mileage__gte=0) | Q(mileage__isnull=True),
				name="insp_mileage_gte_0",
			),
			models.CheckConstraint(
				condition=(Q(energy_level_percent__gte=0) & Q(energy_level_percent__lte=100))
				| Q(energy_level_percent__isnull=True),
				name="insp_energy_0_100",
			),
			models.CheckConstraint(
				condition=Q(completed_at__isnull=True) | Q(status="TERMINE"),
				name="insp_completed_at_only_when_done",
			),
		]

	def __str__(self):
		return f"Inspection #{self.pk} - {self.inspection_type} - {self.status}"


class InspectionPhoto(models.Model):
	class PhotoType(models.TextChoices):
		AVANT = "AVANT", "Avant"
		ARRIERE = "ARRIERE", "Arriere"
		COTE_GAUCHE = "COTE_GAUCHE", "Cote gauche"
		COTE_DROIT = "COTE_DROIT", "Cote droit"
		INTERIEUR = "INTERIEUR", "Interieur"
		TABLEAU_DE_BORD = "TABLEAU_DE_BORD", "Tableau de bord"
		DOMMAGE = "DOMMAGE", "Dommage"
		AUTRE = "AUTRE", "Autre"

	SINGLE_VIEW_TYPES = {
		PhotoType.AVANT,
		PhotoType.ARRIERE,
		PhotoType.COTE_GAUCHE,
		PhotoType.COTE_DROIT,
		PhotoType.TABLEAU_DE_BORD,
	}

	inspection = models.ForeignKey(
		Inspection,
		on_delete=models.CASCADE,
		related_name="photos",
	)
	photo_type = models.CharField(max_length=30, choices=PhotoType.choices)
	file = models.ImageField(upload_to="inspections/photos/")
	position = models.PositiveIntegerField(default=0)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["position", "id"]
		indexes = [
			models.Index(fields=["inspection", "photo_type"], name="insp_photo_type_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(position__gte=0),
				name="insp_photo_position_gte_0",
			),
			models.CheckConstraint(
				condition=Q(photo_type__in=["DOMMAGE", "AUTRE", "INTERIEUR"]) | Q(position=0),
				name="insp_photo_single_views_pos0",
			),
			models.UniqueConstraint(
				fields=["inspection", "photo_type", "position"],
				name="insp_photo_unique_type_position",
			),
		]

	def __str__(self):
		return f"InspectionPhoto #{self.pk} - {self.photo_type}"


class Damage(models.Model):
	class Severity(models.TextChoices):
		MINEUR = "MINEUR", "Mineur"
		MODERE = "MODERE", "Modere"
		MAJEUR = "MAJEUR", "Majeur"
		CRITIQUE = "CRITIQUE", "Critique"

	class Status(models.TextChoices):
		SIGNALE = "SIGNALE", "Signale"
		A_ANALYSER = "A_ANALYSER", "A analyser"
		CONFIRME = "CONFIRME", "Confirme"
		REJETE = "REJETE", "Rejete"
		RESOLU = "RESOLU", "Resolu"

	inspection = models.ForeignKey(
		Inspection,
		on_delete=models.CASCADE,
		related_name="damages",
	)
	vehicle = models.ForeignKey(
		"vehicles.Vehicle",
		on_delete=models.PROTECT,
		related_name="damages",
	)
	reported_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name="reported_damages",
	)
	evidence_photos = models.ManyToManyField(
		InspectionPhoto,
		blank=True,
		related_name="damage_evidence",
	)
	description = models.TextField()
	severity = models.CharField(max_length=20, choices=Severity.choices)
	location = models.CharField(max_length=120)
	is_new = models.BooleanField(default=True)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.SIGNALE, db_index=True)
	estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)
	resolved_at = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["inspection"], name="damage_inspection_idx"),
			models.Index(fields=["vehicle"], name="damage_vehicle_idx"),
			models.Index(fields=["status"], name="damage_status_idx"),
			models.Index(fields=["severity"], name="damage_severity_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(estimated_cost__gte=0) | Q(estimated_cost__isnull=True),
				name="damage_estimated_cost_gte_0",
			),
			models.CheckConstraint(
				condition=Q(resolved_at__isnull=True) | Q(status="RESOLU"),
				name="damage_resolved_at_only_when_resolved",
			),
		]

	def __str__(self):
		return f"Damage #{self.pk} - {self.severity} - {self.status}"
