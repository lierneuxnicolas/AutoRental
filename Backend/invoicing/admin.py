from django.contrib import admin

from invoicing.models import Invoice, InvoiceLine


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
	list_display = ("id", "number", "reservation", "client", "status", "issue_date", "total_amount", "currency")
	list_filter = ("status", "issue_date", "currency")
	search_fields = ("number", "reservation__reference", "client__user__email")


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
	list_display = ("id", "invoice", "line_type", "description", "quantity", "unit_price", "total_price")
	list_filter = ("line_type",)
	search_fields = ("invoice__number", "description")
