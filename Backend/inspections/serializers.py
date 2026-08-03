from __future__ import annotations

import os
import uuid

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from inspections.models import Damage, Inspection, InspectionPhoto
from reservations.models import Reservation


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MANDATORY_PHOTO_TYPES = [
	InspectionPhoto.PhotoType.AVANT,
	InspectionPhoto.PhotoType.ARRIERE,
	InspectionPhoto.PhotoType.COTE_GAUCHE,
	InspectionPhoto.PhotoType.COTE_DROIT,
	InspectionPhoto.PhotoType.INTERIEUR,
	InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
]


def get_mandatory_photo_types(inspection: Inspection) -> list[str]:
	if inspection.inspection_type not in (Inspection.Type.INITIAL, Inspection.Type.FINAL):
		return []
	return list(MANDATORY_PHOTO_TYPES)


def get_missing_mandatory_photo_types(inspection: Inspection) -> list[str]:
	existing_types = set(
		inspection.photos.filter(photo_type__in=MANDATORY_PHOTO_TYPES).values_list("photo_type", flat=True)
	)
	return [photo_type for photo_type in MANDATORY_PHOTO_TYPES if photo_type not in existing_types]


def ensure_inspection_is_photo_eligible(*, inspection: Inspection, requested_by) -> None:
	if inspection.status == Inspection.Status.TERMINE:
		raise serializers.ValidationError({"detail": "Les photos ne peuvent plus etre ajoutees a une inspection terminee."})

	owner = getattr(getattr(inspection.reservation, "client", None), "user", None)
	if owner != requested_by:
		raise serializers.ValidationError({"detail": "Vous ne pouvez modifier que les inspections de vos reservations."})

	reservation_status = inspection.reservation.status
	if inspection.inspection_type == Inspection.Type.INITIAL:
		allowed_statuses = {
			Reservation.Status.CONFIRMEE,
			Reservation.Status.EN_COURS,
			Reservation.Status.A_CONTROLER,
		}
	elif inspection.inspection_type == Inspection.Type.FINAL:
		allowed_statuses = {
			Reservation.Status.EN_COURS,
			Reservation.Status.A_CONTROLER,
			Reservation.Status.TERMINEE,
		}
	else:
		allowed_statuses = set()

	if reservation_status not in allowed_statuses:
		raise serializers.ValidationError({"detail": "La reservation liee a cette inspection n'est pas compatible."})


class InspectionPhotoReadSerializer(serializers.ModelSerializer):
	file = serializers.ImageField(read_only=True)

	class Meta:
		model = InspectionPhoto
		fields = ["id", "inspection", "photo_type", "file", "position", "created_at"]


class InspectionPhotoCreateSerializer(serializers.ModelSerializer):
	class Meta:
		model = InspectionPhoto
		fields = ["file", "photo_type", "position"]
		extra_kwargs = {
			"position": {"required": False},
		}

	def validate(self, attrs):
		inspection = self.context["inspection"]
		requested_by = self.context["requested_by"]
		ensure_inspection_is_photo_eligible(inspection=inspection, requested_by=requested_by)
		return attrs

	def validate_file(self, uploaded_file):
		max_size = int(getattr(settings, "INSPECTION_PHOTO_MAX_SIZE", 10 * 1024 * 1024))
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
			if not normalized_type.startswith("image/"):
				raise serializers.ValidationError("Incoherence entre extension et type MIME.")
			if ext in {".jpg", ".jpeg"} and normalized_type != "image/jpeg":
				raise serializers.ValidationError("Incoherence entre extension et type MIME.")
			if ext == ".png" and normalized_type != "image/png":
				raise serializers.ValidationError("Incoherence entre extension et type MIME.")
			if ext == ".webp" and normalized_type != "image/webp":
				raise serializers.ValidationError("Incoherence entre extension et type MIME.")

		try:
			uploaded_file.seek(0)
			with Image.open(uploaded_file) as image:
				image.verify()
		except (UnidentifiedImageError, OSError, ValueError):
			raise serializers.ValidationError("Le contenu du fichier image est invalide.")
		finally:
			uploaded_file.seek(0)

		return uploaded_file

	def create(self, validated_data):
		inspection = self.context["inspection"]
		uploaded_file = validated_data["file"]

		_, ext = os.path.splitext(uploaded_file.name or "")
		safe_ext = ext.lower()
		uploaded_file.name = f"{uuid.uuid4().hex}{safe_ext}"

		position = validated_data.get("position", 0)
		if validated_data["photo_type"] in InspectionPhoto.SINGLE_VIEW_TYPES:
			position = 0

		return InspectionPhoto.objects.create(
			inspection=inspection,
			photo_type=validated_data["photo_type"],
			file=uploaded_file,
			position=position,
		)


class InspectionDamageReadSerializer(serializers.ModelSerializer):
	photo_ids = serializers.SerializerMethodField()

	class Meta:
		model = Damage
		fields = [
			"id",
			"inspection",
			"vehicle",
			"reported_by",
			"description",
			"severity",
			"location",
			"photo_ids",
			"created_at",
			"updated_at",
		]

	def get_photo_ids(self, obj):
		return list(obj.evidence_photos.values_list("id", flat=True))


class InspectionDamageCreateSerializer(serializers.ModelSerializer):
	photo_ids = serializers.ListField(
		child=serializers.IntegerField(min_value=1),
		required=False,
		allow_empty=True,
	)

	class Meta:
		model = Damage
		fields = ["description", "severity", "location", "photo_ids"]

	def validate_description(self, value):
		cleaned = value.strip()
		if not cleaned:
			raise serializers.ValidationError("La description est obligatoire.")
		return cleaned

	def validate_location(self, value):
		cleaned = value.strip()
		if not cleaned:
			raise serializers.ValidationError("La localisation est obligatoire.")
		return cleaned

	def validate_photo_ids(self, value):
		inspection = self.context["inspection"]
		if not value:
			return []

		unique_ids = list(dict.fromkeys(value))
		photos = list(
			InspectionPhoto.objects.filter(inspection=inspection, id__in=unique_ids).only("id")
		)
		found_ids = {photo.id for photo in photos}
		missing_ids = [photo_id for photo_id in unique_ids if photo_id not in found_ids]
		if missing_ids:
			raise serializers.ValidationError("Certaines photos ne sont pas liees a cette inspection.")

		return unique_ids

	def validate(self, attrs):
		inspection = self.context["inspection"]
		requested_by = self.context["requested_by"]
		ensure_inspection_is_photo_eligible(inspection=inspection, requested_by=requested_by)
		return attrs

	def create(self, validated_data):
		inspection = self.context["inspection"]
		requested_by = self.context["requested_by"]
		photo_ids = validated_data.pop("photo_ids", [])

		damage = Damage.objects.create(
			inspection=inspection,
			vehicle=inspection.reservation.vehicle,
			reported_by=requested_by,
			**validated_data,
		)

		if photo_ids:
			damage.evidence_photos.set(InspectionPhoto.objects.filter(inspection=inspection, id__in=photo_ids))

		return damage