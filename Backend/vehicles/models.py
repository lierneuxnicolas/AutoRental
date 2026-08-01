from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


def _normalize_spaces(value: str) -> str:
	return " ".join(value.split())


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
