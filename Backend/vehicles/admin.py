from django.contrib import admin

from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory, VehiclePhoto


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


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
	list_display = (
		"registration_number",
		"brand",
		"model_name",
		"category",
		"status",
		"parking_space",
		"is_active",
		"updated_at",
	)
	search_fields = ("registration_number", "model_name", "brand__name")
	list_filter = ("status", "is_active", "brand", "category")
	ordering = ("registration_number",)
	list_select_related = ("brand", "category", "parking_space", "parking_space__parking")


@admin.register(VehiclePhoto)
class VehiclePhotoAdmin(admin.ModelAdmin):
	list_display = ("vehicle", "is_primary", "position", "created_at")
	search_fields = ("vehicle__registration_number", "caption")
	list_filter = ("is_primary",)
	ordering = ("-is_primary", "position", "created_at")
	list_select_related = ("vehicle",)
