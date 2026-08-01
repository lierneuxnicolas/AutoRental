from django.contrib import admin

from vehicles.models import Brand, Parking, ParkingSpace, VehicleCategory


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
	list_display = ("name", "is_active", "created_at", "updated_at")
	search_fields = ("name",)
	list_filter = ("is_active",)
	ordering = ("name",)


@admin.register(VehicleCategory)
class VehicleCategoryAdmin(admin.ModelAdmin):
	list_display = (
		"name",
		"daily_rate",
		"hourly_rate",
		"minimum_deposit",
		"minimum_rental_hours",
		"is_active",
		"updated_at",
	)
	search_fields = ("name", "description")
	list_filter = ("is_active",)
	ordering = ("name",)


@admin.register(Parking)
class ParkingAdmin(admin.ModelAdmin):
	list_display = ("name", "capacity", "is_active", "latitude", "longitude", "updated_at")
	search_fields = ("name", "address")
	list_filter = ("is_active",)
	ordering = ("name",)


@admin.register(ParkingSpace)
class ParkingSpaceAdmin(admin.ModelAdmin):
	list_display = ("parking", "number", "is_active", "updated_at")
	search_fields = ("number", "parking__name")
	list_filter = ("is_active", "parking")
	ordering = ("parking__name", "number")
	list_select_related = ("parking",)
