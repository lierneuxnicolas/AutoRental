from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
	list_display = ("user", "notification_type", "title", "is_read", "created_at", "read_at")
	search_fields = ("user__email", "title", "message")
	list_filter = ("notification_type", "is_read", "created_at")
	readonly_fields = ("created_at", "read_at")
