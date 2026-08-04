from rest_framework import serializers

from invoicing.models import Invoice, InvoiceLine


class InvoiceLineSerializer(serializers.ModelSerializer):
	class Meta:
		model = InvoiceLine
		fields = [
			"id",
			"line_type",
			"description",
			"quantity",
			"unit_price",
			"total_price",
		]
		read_only_fields = fields


class InvoiceListSerializer(serializers.ModelSerializer):
	reservation_id = serializers.IntegerField(source="reservation.id", read_only=True)

	class Meta:
		model = Invoice
		fields = [
			"id",
			"number",
			"reservation_id",
			"status",
			"issue_date",
			"total_amount",
			"currency",
		]
		read_only_fields = fields


class InvoiceDetailSerializer(serializers.ModelSerializer):
	reservation_id = serializers.IntegerField(source="reservation.id", read_only=True)
	client_id = serializers.IntegerField(source="client.id", read_only=True)
	pdf_url = serializers.SerializerMethodField()
	lines = InvoiceLineSerializer(many=True, read_only=True)

	class Meta:
		model = Invoice
		fields = [
			"id",
			"number",
			"reservation_id",
			"client_id",
			"status",
			"issue_date",
			"subtotal",
			"tax_amount",
			"total_amount",
			"currency",
			"billing_name",
			"billing_address",
			"pdf_url",
			"lines",
			"created_at",
		]
		read_only_fields = fields

	def get_pdf_url(self, obj):
		request = self.context.get("request")
		if not obj.pdf_file:
			return None
		url = obj.pdf_file.url
		if request is None:
			return url
		return request.build_absolute_uri(url)
