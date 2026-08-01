from django.contrib import admin

from reservations.models import Reservation


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
	list_display = (
		"reference",
		"client",
		"vehicle",
		"start_at",
		"end_at",
		"status",
		"rental_amount",
		"created_at",
	)
	search_fields = (
		"reference",
		"client__user__email",
		"vehicle__registration_number",
	)
	list_filter = (
		"status",
		"vehicle",
		"start_at",
		"end_at",
		"created_at",
	)
	list_select_related = ("client__user", "vehicle")
	readonly_fields = (
		"reference",
		"created_at",
		"updated_at",
		"confirmed_at",
		"cancelled_at",
	)
	ordering = ("-created_at", "-id")
	actions = None
