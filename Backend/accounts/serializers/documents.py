import os
import uuid

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from accounts.models import ClientDocument
from notifications.services import create_notification


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PDF_EXTENSION = ".pdf"


class ClientDocumentReadSerializer(serializers.ModelSerializer):
    file = serializers.FileField(read_only=True)

    class Meta:
        model = ClientDocument
        fields = (
            "id",
            "document_type",
            "document_number",
            "expiration_date",
            "status",
            "rejection_reason",
            "uploaded_at",
            "validated_at",
            "is_active",
            "file",
        )


class ClientDocumentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientDocument
        fields = (
            "document_type",
            "document_number",
            "file",
            "expiration_date",
        )

    def validate_document_number(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Le numero du document est obligatoire.")
        return cleaned

    def validate_expiration_date(self, value):
        if value <= timezone.localdate():
            raise serializers.ValidationError(
                "La date d'expiration doit etre strictement posterieure a aujourd'hui."
            )
        return value

    def validate_file(self, uploaded_file):
        max_size = int(getattr(settings, "CLIENT_DOCUMENT_MAX_SIZE", 10 * 1024 * 1024))
        if uploaded_file.size > max_size:
            raise serializers.ValidationError("Le fichier depasse la taille maximale autorisee.")

        _, ext = os.path.splitext(uploaded_file.name or "")
        ext = ext.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError("Extension de fichier non autorisee.")

        content_type = getattr(uploaded_file, "content_type", None)
        if content_type:
            normalized_type = str(content_type).lower()
            if normalized_type not in ALLOWED_MIME_TYPES:
                raise serializers.ValidationError("Type MIME non autorise.")
            if ext == PDF_EXTENSION and normalized_type != "application/pdf":
                raise serializers.ValidationError("Incoherence entre extension et type MIME.")
            if ext in IMAGE_EXTENSIONS and not normalized_type.startswith("image/"):
                raise serializers.ValidationError("Incoherence entre extension et type MIME.")

        if ext in IMAGE_EXTENSIONS:
            try:
                uploaded_file.seek(0)
                with Image.open(uploaded_file) as image:
                    image.verify()
            except (UnidentifiedImageError, OSError, ValueError):
                raise serializers.ValidationError("Le contenu du fichier image est invalide.")
            finally:
                uploaded_file.seek(0)
        elif ext == PDF_EXTENSION:
            try:
                uploaded_file.seek(0)
                signature = uploaded_file.read(5)
                if signature != b"%PDF-":
                    raise serializers.ValidationError("Le contenu du fichier PDF est invalide.")
            finally:
                uploaded_file.seek(0)

        return uploaded_file

    def create(self, validated_data):
        client_profile = self.context["client_profile"]
        uploaded_file = validated_data["file"]

        _, ext = os.path.splitext(uploaded_file.name or "")
        safe_ext = ext.lower()
        uploaded_file.name = f"{uuid.uuid4().hex}{safe_ext}"

        document = ClientDocument.objects.create(
            client=client_profile,
            document_type=validated_data["document_type"],
            document_number=validated_data["document_number"],
            file=uploaded_file,
            expiration_date=validated_data["expiration_date"],
            status=ClientDocument.Status.EN_ATTENTE,
            rejection_reason="",
            validated_at=None,
            validated_by=None,
            is_active=True,
        )

        notification_message = (
            f"Votre document {document.get_document_type_display()} a ete transmis et est en attente de validation."
        )

        def _notify_document_uploaded_once():
            if document.client.user.notifications.filter(
                notification_type="DOCUMENT_UPLOADED",
                message=notification_message,
                related_object_type="document",
                related_object_id=document.id,
            ).exists():
                return

            create_notification(
                user=document.client.user,
                notification_type="DOCUMENT_UPLOADED",
                title="Document transmis",
                message=notification_message,
                related_object_type="document",
                related_object_id=document.id,
            )

        transaction.on_commit(_notify_document_uploaded_once)
        return document


class ManagerClientDocumentListSerializer(serializers.ModelSerializer):
    client = serializers.IntegerField(source="client.id", read_only=True)
    client_email = serializers.EmailField(source="client.user.email", read_only=True)
    client_first_name = serializers.CharField(source="client.user.first_name", read_only=True)
    client_last_name = serializers.CharField(source="client.user.last_name", read_only=True)
    validated_by_email = serializers.EmailField(source="validated_by.email", read_only=True, allow_null=True)

    class Meta:
        model = ClientDocument
        fields = (
            "id",
            "client",
            "client_email",
            "client_first_name",
            "client_last_name",
            "document_type",
            "document_number",
            "expiration_date",
            "status",
            "is_active",
            "uploaded_at",
            "validated_at",
            "validated_by_email",
        )


class ManagerClientDocumentDetailSerializer(serializers.ModelSerializer):
    client = serializers.IntegerField(source="client.id", read_only=True)
    client_email = serializers.EmailField(source="client.user.email", read_only=True)
    client_first_name = serializers.CharField(source="client.user.first_name", read_only=True)
    client_last_name = serializers.CharField(source="client.user.last_name", read_only=True)
    validated_by = serializers.IntegerField(source="validated_by.id", read_only=True, allow_null=True)
    validated_by_email = serializers.EmailField(source="validated_by.email", read_only=True, allow_null=True)
    file = serializers.FileField(read_only=True)

    class Meta:
        model = ClientDocument
        fields = (
            "id",
            "client",
            "client_email",
            "client_first_name",
            "client_last_name",
            "document_type",
            "document_number",
            "file",
            "expiration_date",
            "status",
            "rejection_reason",
            "uploaded_at",
            "validated_at",
            "validated_by",
            "validated_by_email",
            "is_active",
            "created_at",
            "updated_at",
        )


class ManagerRejectDocumentSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=False)

    def validate_reason(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Le motif de refus est obligatoire.")

        max_length = ClientDocument._meta.get_field("rejection_reason").max_length
        if max_length is not None and len(cleaned) > max_length:
            raise serializers.ValidationError(
                f"Le motif de refus ne peut pas depasser {max_length} caracteres."
            )

        return cleaned