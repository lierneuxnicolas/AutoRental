from django.urls import path

from invoicing.views import (
	InvoiceClientDetailView,
	InvoiceClientDownloadView,
	InvoiceClientListView,
	InvoiceManagementListView,
)

app_name = "invoicing"

urlpatterns = [
	path("invoices/", InvoiceClientListView.as_view(), name="invoice-list"),
	path("invoices/<int:pk>/", InvoiceClientDetailView.as_view(), name="invoice-detail"),
	path("invoices/<int:pk>/download/", InvoiceClientDownloadView.as_view(), name="invoice-download"),
	path("management/invoices/", InvoiceManagementListView.as_view(), name="management-invoice-list"),
]
