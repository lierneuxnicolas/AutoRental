from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Role, User


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
	list_display = ("code", "label", "is_active", "created_at", "updated_at")
	search_fields = ("code", "label")
	list_filter = ("is_active",)
	ordering = ("code",)
	readonly_fields = ("created_at", "updated_at")
	list_per_page = 25

	def get_readonly_fields(self, request, obj=None):
		if obj is not None:
			return self.readonly_fields + ("code",)
		return self.readonly_fields


@admin.register(User)
class CustomUserAdmin(UserAdmin):
	list_display = (
		"email",
		"first_name",
		"last_name",
		"role",
		"email_verified",
		"is_active",
		"is_staff",
		"date_joined",
	)
	search_fields = ("email", "first_name", "last_name")
	list_filter = ("role", "is_active", "email_verified", "is_staff", "is_superuser")
	ordering = ("email",)
	readonly_fields = ("date_joined", "last_login")
	list_select_related = ("role",)
	list_per_page = 25

	fieldsets = (
		("Identite", {"fields": ("email", "password")}),
		("Informations personnelles", {"fields": ("first_name", "last_name", "phone")}),
		("Role et etat du compte", {"fields": ("role", "email_verified", "is_active")}),
		(
			"Permissions Django",
			{"fields": ("is_staff", "is_superuser", "groups", "user_permissions")},
		),
		("Dates importantes", {"fields": ("last_login", "date_joined")}),
	)

	add_fieldsets = (
		(
			None,
			{
				"classes": ("wide",),
				"fields": (
					"email",
					"password1",
					"password2",
					"first_name",
					"last_name",
					"phone",
					"role",
					"email_verified",
					"is_active",
					"is_staff",
					"is_superuser",
					"groups",
					"user_permissions",
				),
			},
		),
	)
