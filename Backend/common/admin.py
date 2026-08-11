from django.contrib import admin

from common.models import SystemLog


@admin.register(SystemLog)
class SystemLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "level", "user", "action", "message")
    list_filter = ("level", "created_at")
    search_fields = ("action", "message", "user__email")
    readonly_fields = ("created_at", "user", "action", "message", "level", "ip_address")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
