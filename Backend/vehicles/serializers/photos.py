import os
import uuid

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from vehicles.models import VehiclePhoto


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {
	"image/jpeg",
	"image/png",
	"image/webp",
}


class VehiclePhotoReadSerializer(serializers.ModelSerializer):
	file = serializers.ImageField(read_only=True)

	class Meta:
		model = VehiclePhoto
		fields = ["id", "file", "is_primary", "position", "caption", "created_at", "updated_at"]


class VehiclePhotoCreateSerializer(serializers.ModelSerializer):
	class Meta:
		model = VehiclePhoto
		fields = ["file", "is_primary", "position", "caption"]
		extra_kwargs = {
			"is_primary": {"required": False},
			"position": {"required": False},
			"caption": {"required": False, "allow_blank": True},
		}

	def validate_file(self, uploaded_file):
		max_size = int(getattr(settings, "VEHICLE_PHOTO_MAX_SIZE", 10 * 1024 * 1024))
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
		vehicle = self.context["vehicle"]
		uploaded_file = validated_data["file"]

		_, ext = os.path.splitext(uploaded_file.name or "")
		safe_ext = ext.lower()
		uploaded_file.name = f"{uuid.uuid4().hex}{safe_ext}"

		is_primary = bool(validated_data.get("is_primary", False))
		if not vehicle.photos.exists():
			# Auto-promote first photo to primary for deterministic catalog rendering.
			is_primary = True

		return VehiclePhoto.objects.create(
			vehicle=vehicle,
			file=uploaded_file,
			is_primary=is_primary,
			position=validated_data.get("position", 0),
			caption=validated_data.get("caption", ""),
		)
