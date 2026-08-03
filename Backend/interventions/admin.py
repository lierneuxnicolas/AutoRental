from django.contrib import admin
from interventions.models import (
	Intervention,
	LockingLog,
	TechnicalInspection,
	TechnicalPhoto,
	VehicleAccess,
)


class TechnicalPhotoInline(admin.TabularInline):
	model = TechnicalPhoto
	extra = 1


@admin.register(VehicleAccess)
class VehicleAccessAdmin(admin.ModelAdmin):
	list_display = (
		"reservation",
		"vehicle",
		"client",
		"status",
		"lock_state",
		"is_active",
		"valid_from",
		"valid_until",
	)
	list_filter = ("status", "lock_state", "is_active")
	search_fields = ("reservation__reference", "vehicle__registration_number", "client__email")
	autocomplete_fields = ("reservation", "vehicle", "client")


@admin.register(LockingLog)
class LockingLogAdmin(admin.ModelAdmin):
	list_display = (
		"action",
		"result",
		"reservation",
		"vehicle",
		"user",
		"failure_code",
		"created_at",
	)
	list_filter = ("action", "result", "created_at")
	search_fields = (
		"reservation__reference",
		"vehicle__registration_number",
		"user__email",
		"failure_code",
	)
	readonly_fields = (
		"vehicle_access",
		"reservation",
		"vehicle",
		"user",
		"action",
		"result",
		"failure_code",
		"failure_message",
		"attempted_reservation_id",
		"ip_address",
		"user_agent",
		"metadata",
		"created_at",
	)

	def has_add_permission(self, request):
		return False

	def has_change_permission(self, request, obj=None):
		return False

	def has_delete_permission(self, request, obj=None):
		return False


@admin.register(Intervention)
class InterventionAdmin(admin.ModelAdmin):
	list_display = (
		"reference",
		"intervention_type",
		"status",
		"vehicle",
		"reservation",
		"assigned_to",
		"created_by",
		"started_at",
		"completed_at",
		"created_at",
	)
	list_filter = ("intervention_type", "status", "created_at")
	search_fields = (
		"reference",
		"vehicle__registration_number",
		"reservation__reference",
		"assigned_to__email",
		"created_by__email",
	)
	autocomplete_fields = ("reservation", "vehicle", "assigned_to", "created_by", "inspection")


@admin.register(TechnicalInspection)
class TechnicalInspectionAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"intervention",
		"vehicle",
		"mileage",
		"energy_level_percent",
		"created_at",
	)
	list_filter = ("created_at",)
	search_fields = (
		"intervention__reference",
		"vehicle__registration_number",
		"observations",
	)
	autocomplete_fields = ("intervention", "vehicle")
	inlines = [TechnicalPhotoInline]


@admin.register(TechnicalPhoto)
class TechnicalPhotoAdmin(admin.ModelAdmin):
	list_display = ("id", "technical_inspection", "caption", "created_at")
	list_filter = ("created_at",)
	search_fields = ("caption", "technical_inspection__intervention__reference")
	autocomplete_fields = ("technical_inspection",)
