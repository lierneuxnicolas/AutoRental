from decimal import Decimal
from datetime import date

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import Q


def _normalize_spaces(value: str) -> str:
	return " ".join(value.split())


def _normalize_registration(value: str) -> str:
	return _normalize_spaces(value).upper()


class Brand(models.Model):
	name = models.CharField(max_length=120, unique=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["name"]
		indexes = [
			models.Index(fields=["name"], name="vehicle_brand_name_idx"),
			models.Index(fields=["is_active"], name="vehicle_brand_active_idx"),
		]

	def clean(self):
		super().clean()
		if self.name:
			self.name = _normalize_spaces(self.name)

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return self.name


class VehicleCategory(models.Model):
	name = models.CharField(max_length=120, unique=True)
	description = models.TextField(blank=True)
	daily_rate = models.DecimalField(
		max_digits=10,
		decimal_places=2,
		validators=[MinValueValidator(Decimal("0.01"))],
	)
	hourly_rate = models.DecimalField(
		max_digits=10,
		decimal_places=2,
		null=True,
		blank=True,
		validators=[MinValueValidator(Decimal("0.00"))],
	)
	minimum_deposit = models.DecimalField(
		max_digits=10,
		decimal_places=2,
		validators=[MinValueValidator(Decimal("0.01"))],
	)
	minimum_rental_hours = models.PositiveIntegerField(default=1)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["name"]
		indexes = [
			models.Index(fields=["name"], name="vehicle_cat_name_idx"),
			models.Index(fields=["is_active"], name="vehicle_cat_active_idx"),
			models.Index(fields=["daily_rate"], name="vehicle_cat_daily_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(daily_rate__gte=0),
				name="vehicle_cat_daily_rate_non_negative",
			),
			models.CheckConstraint(
				condition=Q(hourly_rate__isnull=True) | Q(hourly_rate__gte=0),
				name="vehicle_cat_hourly_rate_non_negative",
			),
			models.CheckConstraint(
				condition=Q(minimum_deposit__gte=0),
				name="vehicle_cat_deposit_non_negative",
			),
			models.CheckConstraint(
				condition=Q(minimum_rental_hours__gt=0),
				name="vehicle_cat_min_hours_positive",
			),
		]

	def clean(self):
		super().clean()
		if self.name:
			self.name = _normalize_spaces(self.name)

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return self.name


class Parking(models.Model):
	name = models.CharField(max_length=150, unique=True)
	address = models.TextField()
	latitude = models.DecimalField(
		max_digits=9,
		decimal_places=6,
		null=True,
		blank=True,
		validators=[MinValueValidator(Decimal("-90")), MaxValueValidator(Decimal("90"))],
	)
	longitude = models.DecimalField(
		max_digits=9,
		decimal_places=6,
		null=True,
		blank=True,
		validators=[MinValueValidator(Decimal("-180")), MaxValueValidator(Decimal("180"))],
	)
	capacity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["name"]
		indexes = [
			models.Index(fields=["name"], name="parking_name_idx"),
			models.Index(fields=["is_active"], name="parking_active_idx"),
		]
		constraints = [
			models.CheckConstraint(
				condition=Q(capacity__gt=0),
				name="parking_capacity_positive",
			),
			models.CheckConstraint(
				condition=Q(latitude__isnull=True) | (Q(latitude__gte=-90) & Q(latitude__lte=90)),
				name="parking_latitude_range",
			),
			models.CheckConstraint(
				condition=Q(longitude__isnull=True) | (Q(longitude__gte=-180) & Q(longitude__lte=180)),
				name="parking_longitude_range",
			),
		]

	def clean(self):
		super().clean()
		if self.name:
			self.name = _normalize_spaces(self.name)
		if self.address:
			self.address = _normalize_spaces(self.address)

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return self.name


class ParkingSpace(models.Model):
	parking = models.ForeignKey(Parking, on_delete=models.CASCADE, related_name="spaces")
	number = models.CharField(max_length=50)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["parking__name", "number"]
		constraints = [
			models.UniqueConstraint(fields=["parking", "number"], name="parking_space_unique_number"),
		]
		indexes = [
			models.Index(fields=["parking"], name="parking_space_parking_idx"),
			models.Index(fields=["number"], name="parking_space_number_idx"),
			models.Index(fields=["is_active"], name="parking_space_active_idx"),
			models.Index(fields=["parking", "number"], name="parking_space_pk_num_idx"),
		]

	def clean(self):
		super().clean()
		if self.number:
			self.number = _normalize_spaces(self.number)

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"{self.parking.name} - {self.number}"


class Vehicle(models.Model):
	class Status(models.TextChoices):
		DISPONIBLE = "DISPONIBLE", "Disponible"
		RESERVE = "RESERVE", "Reserve"
		LOUE = "LOUE", "Loue"
		A_CONTROLER = "A_CONTROLER", "A controler"
		MAINTENANCE = "MAINTENANCE", "Maintenance"
		NETTOYAGE = "NETTOYAGE", "Nettoyage"
		ACCIDENTE = "ACCIDENTE", "Accidente"
		INDISPONIBLE = "INDISPONIBLE", "Indisponible"

	brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name="vehicles")
	category = models.ForeignKey(VehicleCategory, on_delete=models.PROTECT, related_name="vehicles")
	parking_space = models.OneToOneField(
		ParkingSpace,
		on_delete=models.PROTECT,
		related_name="vehicle",
	)
	registration_number = models.CharField(max_length=30, unique=True)
	model_name = models.CharField(max_length=150)
	year = models.PositiveIntegerField(validators=[MinValueValidator(1886)])
	color = models.CharField(max_length=60)
	energy_type = models.CharField(max_length=60)
	transmission = models.CharField(max_length=60)
	seats = models.PositiveIntegerField(validators=[MinValueValidator(1)])
	doors = models.PositiveIntegerField(validators=[MinValueValidator(1)])
	mileage = models.PositiveIntegerField(default=0)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DISPONIBLE)
	description = models.TextField(blank=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["brand__name", "model_name", "registration_number"]
		indexes = [
			models.Index(fields=["status"], name="vehicle_status_idx"),
			models.Index(fields=["category"], name="vehicle_category_idx"),
			models.Index(fields=["brand"], name="vehicle_brand_idx"),
			models.Index(fields=["is_active"], name="vehicle_active_idx"),
		]
		constraints = [
			models.CheckConstraint(condition=Q(seats__gt=0), name="vehicle_seats_positive"),
			models.CheckConstraint(condition=Q(doors__gt=0), name="vehicle_doors_positive"),
			models.CheckConstraint(condition=Q(mileage__gte=0), name="vehicle_mileage_non_negative"),
		]

	def clean(self):
		super().clean()

		if self.registration_number:
			self.registration_number = _normalize_registration(self.registration_number)

		if self.model_name:
			self.model_name = _normalize_spaces(self.model_name)

		if self.color:
			self.color = _normalize_spaces(self.color)

		if self.energy_type:
			self.energy_type = _normalize_spaces(self.energy_type)

		if self.transmission:
			self.transmission = _normalize_spaces(self.transmission)

		if self.description:
			self.description = _normalize_spaces(self.description)

		max_year = date.today().year + 1
		if self.year and self.year > max_year:
			raise models.ValidationError({"year": "L'annee du vehicule est invalide."})

		if self.parking_space_id:
			space = self.parking_space
			if not space.is_active:
				raise models.ValidationError({"parking_space": "La place de parking est inactive."})
			if not space.parking.is_active:
				raise models.ValidationError({"parking_space": "Le parking associe est inactif."})

	def save(self, *args, **kwargs):
		self.full_clean()
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"{self.registration_number} - {self.brand.name} {self.model_name}"


class VehiclePhoto(models.Model):
	vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="photos")
	file = models.ImageField(upload_to="vehicles/photos/")
	is_primary = models.BooleanField(default=False)
	position = models.PositiveIntegerField(default=0)
	caption = models.CharField(max_length=255, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-is_primary", "position", "created_at", "id"]
		indexes = [
			models.Index(fields=["vehicle"], name="vehicle_photo_vehicle_idx"),
			models.Index(fields=["is_primary"], name="vehicle_photo_primary_idx"),
			models.Index(fields=["position"], name="vehicle_photo_position_idx"),
		]

	def clean(self):
		super().clean()
		if self.caption:
			self.caption = _normalize_spaces(self.caption)

	def save(self, *args, **kwargs):
		self.full_clean()

		with transaction.atomic():
			if self.is_primary and self.vehicle_id:
				(
					VehiclePhoto.objects.select_for_update()
					.filter(vehicle_id=self.vehicle_id)
					.exclude(pk=self.pk)
					.update(is_primary=False)
				)

			super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"Photo {self.vehicle.registration_number} ({self.position})"
