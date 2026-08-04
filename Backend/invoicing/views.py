from django.http import FileResponse, Http404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsClient, IsManagerOrAdministrator
from invoicing.models import Invoice
from invoicing.serializers import InvoiceDetailSerializer, InvoiceListSerializer


ErrorDetailResponseSerializer = OpenApiResponse(description="Erreur de validation ou d'autorisation.")


class InvoiceClientListView(generics.ListAPIView):
	permission_classes = [IsAuthenticated, IsClient]
	serializer_class = InvoiceListSerializer

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Invoice.objects.none()

		return Invoice.objects.filter(client__user=self.request.user).select_related(
			"reservation",
			"client",
			"client__user",
		).order_by("-issue_date", "-id")

	@extend_schema(
		tags=["Invoices"],
		description="Liste des factures du client authentifie (proprietaire uniquement).",
		responses={
			200: InvoiceListSerializer(many=True),
			401: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class InvoiceClientDetailView(generics.RetrieveAPIView):
	permission_classes = [IsAuthenticated, IsClient]
	serializer_class = InvoiceDetailSerializer

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Invoice.objects.none()

		return Invoice.objects.filter(client__user=self.request.user).select_related(
			"reservation",
			"client",
			"client__user",
		).prefetch_related("lines")

	@extend_schema(
		tags=["Invoices"],
		description="Detail d'une facture du client authentifie (proprietaire uniquement).",
		responses={
			200: InvoiceDetailSerializer,
			401: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)


class InvoiceClientDownloadView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated, IsClient]

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Invoice.objects.none()

		return Invoice.objects.filter(client__user=self.request.user).select_related(
			"reservation",
			"client",
			"client__user",
		).prefetch_related("lines")

	@extend_schema(
		tags=["Invoices"],
		description="Telecharge le PDF de la facture du client authentifie.",
		responses={
			200: OpenApiResponse(description="PDF binaire (application/pdf)."),
			401: ErrorDetailResponseSerializer,
			404: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		from invoicing.services.pdf_generator import ensure_invoice_pdf

		invoice = self.get_queryset().filter(pk=kwargs.get("pk")).first()
		if invoice is None:
			raise Http404

		invoice = ensure_invoice_pdf(invoice)
		if not invoice.pdf_file:
			raise Http404

		return FileResponse(
			invoice.pdf_file.open("rb"),
			as_attachment=True,
			filename=f"{invoice.number}.pdf",
			content_type="application/pdf",
		)


class InvoiceManagementListView(generics.ListAPIView):
	permission_classes = [IsAuthenticated, IsManagerOrAdministrator]
	serializer_class = InvoiceListSerializer

	def get_queryset(self):
		if getattr(self, "swagger_fake_view", False):
			return Invoice.objects.none()

		return Invoice.objects.select_related(
			"reservation",
			"client",
			"client__user",
		).order_by("-issue_date", "-id")

	@extend_schema(
		tags=["Invoice Management"],
		description="Liste de toutes les factures pour gestionnaire-comptable et administrateur.",
		responses={
			200: InvoiceListSerializer(many=True),
			401: ErrorDetailResponseSerializer,
			403: ErrorDetailResponseSerializer,
		},
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)
