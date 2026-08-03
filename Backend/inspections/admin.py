from django.contrib import admin

from inspections.models import Damage, Inspection, InspectionPhoto


@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"reservation",
		"inspection_type",
		"status",
		"mileage",
		"energy_level_percent",
		"has_critical_issue",
		"completed_by",
		"completed_at",
		"created_at",
	)
	list_filter = ("inspection_type", "status", "has_critical_issue", "created_at")
	search_fields = ("reservation__reference", "comments", "critical_issue_description")
	readonly_fields = ("created_at", "updated_at")


@admin.register(InspectionPhoto)
class InspectionPhotoAdmin(admin.ModelAdmin):
	list_display = ("id", "inspection", "photo_type", "position", "created_at")
	list_filter = ("photo_type", "created_at")
	search_fields = ("inspection__reservation__reference",)
	readonly_fields = ("created_at",)


@admin.register(Damage)
class DamageAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"inspection",
		"vehicle",
		"reported_by",
		"severity",
		"status",
		"is_new",
		"estimated_cost",
		"resolved_at",
		"created_at",
	)
	list_filter = ("severity", "status", "is_new", "created_at")
	search_fields = ("inspection__reservation__reference", "vehicle__registration_number", "description", "location")
	readonly_fields = ("created_at", "updated_at")
