from django.contrib import admin
from interventions.models import LockingLog, VehicleAccess


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
