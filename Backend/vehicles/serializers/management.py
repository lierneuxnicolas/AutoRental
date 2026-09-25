import json
from datetime import date

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from inspections.models import Damage, Inspection, InspectionPhoto
from inspections.serializers import InspectionPhotoCreateSerializer
from interventions.models import Intervention
from vehicles.models import Brand, ParkingSpace, Vehicle, VehicleCategory, VehicleEquipment
from vehicles.serializers.public import VehiclePhotoPublicSerializer


def _normalize_registration(value: str) -> str:
	return " ".join(value.split()).upper()


class VehicleManagementListSerializer(serializers.Serializer):
	id = serializers.IntegerField(read_only=True)
	brand = serializers.CharField(source="brand.name", read_only=True)
	model_name = serializers.CharField(read_only=True)
	category = serializers.CharField(source="category.name", read_only=True)
	registration_number = serializers.CharField(read_only=True)
	is_active = serializers.BooleanField(read_only=True)
	public_status = serializers.CharField(source="status", read_only=True)
	needs_supervision = serializers.BooleanField(read_only=True)
	has_urgent_checkin_anomaly = serializers.BooleanField(read_only=True)
	parking_name = serializers.CharField(source="parking_space.parking.name", read_only=True)
	parking_space_number = serializers.CharField(source="parking_space.number", read_only=True)
	main_photo = serializers.SerializerMethodField()

	def get_main_photo(self, obj):
		photos = list(obj.photos.all())
		primary = next((photo for photo in photos if photo.is_primary), None)
		photo = primary or (photos[0] if photos else None)
		if photo is None:
			return None
		return VehiclePhotoPublicSerializer(photo, context=self.context).data


class VehicleManagementWriteSerializer(serializers.ModelSerializer):
	REFERENCE_PHOTO_FIELDS = {
		"reference_front_left": (InspectionPhoto.PhotoType.AVANT, 0),
		"reference_front_right": (InspectionPhoto.PhotoType.COTE_DROIT, 0),
		"reference_rear_left": (InspectionPhoto.PhotoType.COTE_GAUCHE, 0),
		"reference_rear_right": (InspectionPhoto.PhotoType.ARRIERE, 0),
		"reference_dashboard": (InspectionPhoto.PhotoType.TABLEAU_DE_BORD, 0),
		"reference_front_seats": (InspectionPhoto.PhotoType.INTERIEUR, 1),
		"reference_rear_seats": (InspectionPhoto.PhotoType.INTERIEUR, 2),
		"reference_trunk": (InspectionPhoto.PhotoType.AUTRE, 1),
	}

	brand = serializers.PrimaryKeyRelatedField(queryset=Brand.objects.all())
	category = serializers.PrimaryKeyRelatedField(queryset=VehicleCategory.objects.all())
	parking_space = serializers.PrimaryKeyRelatedField(queryset=ParkingSpace.objects.select_related("parking"))
	category_daily_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
	equipment = serializers.PrimaryKeyRelatedField(
		many=True,
		required=False,
		queryset=VehicleEquipment.objects.filter(is_active=True),
	)
	fuel_type = serializers.CharField(source="energy_type")
	status = serializers.ChoiceField(choices=Vehicle.Status.choices, required=False, default=Vehicle.Status.DISPONIBLE)
	initial_energy_level_percent = serializers.IntegerField(min_value=0, max_value=100, required=False, write_only=True)
	initial_damages = serializers.CharField(required=False, allow_blank=True, default="[]", write_only=True)
	initial_damage_photos = serializers.ListField(
		child=serializers.ImageField(),
		required=False,
		write_only=True,
	)
	reference_front_left = serializers.ImageField(required=False, write_only=True)
	reference_front_right = serializers.ImageField(required=False, write_only=True)
	reference_rear_left = serializers.ImageField(required=False, write_only=True)
	reference_rear_right = serializers.ImageField(required=False, write_only=True)
	reference_dashboard = serializers.ImageField(required=False, write_only=True)
	reference_front_seats = serializers.ImageField(required=False, write_only=True)
	reference_rear_seats = serializers.ImageField(required=False, write_only=True)
	reference_trunk = serializers.ImageField(required=False, write_only=True)

	class Meta:
		model = Vehicle
		fields = [
			"id",
			"brand",
			"category",
			"parking_space",
			"category_daily_rate",
			"registration_number",
			"model_name",
			"year",
			"color",
			"fuel_type",
			"transmission",
			"seats",
			"doors",
			"mileage",
			"power_hp",
			"consumption",
			"trunk_volume",
			"euro_standard",
			"included_km_per_day",
			"extra_km_price",
			"minimum_age",
			"required_license",
			"recommended_use",
			"description",
			"status",
			"is_active",
			"equipment",
			"initial_energy_level_percent",
			"initial_damages",
			"initial_damage_photos",
			"reference_front_left",
			"reference_front_right",
			"reference_rear_left",
			"reference_rear_right",
			"reference_dashboard",
			"reference_front_seats",
			"reference_rear_seats",
			"reference_trunk",
		]
		read_only_fields = ["id"]

	def validate_brand(self, value):
		if not value.is_active:
			raise serializers.ValidationError("La marque selectionnee est inactive.")
		return value

	def validate_category(self, value):
		if not value.is_active:
			raise serializers.ValidationError("La categorie selectionnee est inactive.")
		return value

	def validate_category_daily_rate(self, value):
		if value <= 0:
			raise serializers.ValidationError("Le tarif journalier doit etre superieur a 0.")
		return value

	def validate_parking_space(self, value):
		if not value.is_active:
			raise serializers.ValidationError("La place de parking est inactive.")
		if not value.parking.is_active:
			raise serializers.ValidationError("Le parking associe est inactif.")

		vehicle = getattr(value, "vehicle", None)
		instance = getattr(self, "instance", None)
		if vehicle is not None and (instance is None or vehicle.id != instance.id):
			raise serializers.ValidationError("La place de parking est deja occupee.")
		return value

	def validate_registration_number(self, value):
		normalized = _normalize_registration(value)
		if not normalized:
			raise serializers.ValidationError("L'immatriculation est obligatoire.")

		queryset = Vehicle.objects.filter(registration_number=normalized)
		if self.instance is not None:
			queryset = queryset.exclude(pk=self.instance.pk)
		if queryset.exists():
			raise serializers.ValidationError("Cette immatriculation existe deja.")
		return normalized

	def validate_year(self, value):
		max_year = date.today().year + 1
		if value > max_year:
			raise serializers.ValidationError("L'annee du vehicule est invalide.")
		return value

	def validate_seats(self, value):
		if value < 1:
			raise serializers.ValidationError("Le nombre de sieges doit etre superieur a 0.")
		return value

	def validate_doors(self, value):
		if value < 1:
			raise serializers.ValidationError("Le nombre de portes doit etre superieur a 0.")
		return value

	def validate_mileage(self, value):
		if value < 0:
			raise serializers.ValidationError("Le kilometrage ne peut pas etre negatif.")
		return value

	def validate(self, attrs):
		if self.instance is None and "parking_space" not in attrs:
			raise serializers.ValidationError({"parking_space": "Ce champ est obligatoire."})
		if self.instance is None:
			required_fields = {
				"mileage": "Le kilometrage initial est obligatoire.",
				"initial_energy_level_percent": "Le niveau de carburant ou d'energie initial est obligatoire.",
				**{
					field_name: "Cette photo de reference est obligatoire."
					for field_name in self.REFERENCE_PHOTO_FIELDS
				},
			}
			missing = {
				field_name: message
				for field_name, message in required_fields.items()
				if field_name not in attrs
			}
			if missing:
				raise serializers.ValidationError(missing)

			photo_validator = InspectionPhotoCreateSerializer()
			for field_name in self.REFERENCE_PHOTO_FIELDS:
				photo_validator.validate_file(attrs[field_name])
			for photo in attrs.get("initial_damage_photos", []):
				photo_validator.validate_file(photo)

			try:
				damages = json.loads(attrs.get("initial_damages") or "[]")
			except (TypeError, json.JSONDecodeError):
				raise serializers.ValidationError({"initial_damages": "Le format des dommages est invalide."})
			if not isinstance(damages, list):
				raise serializers.ValidationError({"initial_damages": "Une liste de dommages est attendue."})
			if len(damages) > 1:
				raise serializers.ValidationError({"initial_damages": "Un seul dommage initial est autorise."})

			valid_severities = {Damage.Severity.ACCEPTABLE, Damage.Severity.GRAVE}
			damage_photos = attrs.get("initial_damage_photos", [])
			if len(damage_photos) > 1:
				raise serializers.ValidationError({"initial_damage_photos": "Une seule photo de dommage est autorisee."})
			for index, damage in enumerate(damages):
				if not isinstance(damage, dict) or not str(damage.get("description", "")).strip():
					raise serializers.ValidationError({"initial_damages": f"La description du dommage {index + 1} est obligatoire."})
				if damage.get("severity") not in valid_severities:
					raise serializers.ValidationError({"initial_damages": f"La gravite du dommage {index + 1} est invalide."})
				photo_index = damage.get("photo_index")
				if photo_index is not None and (not isinstance(photo_index, int) or photo_index < 0 or photo_index >= len(damage_photos)):
					raise serializers.ValidationError({"initial_damages": f"La photo du dommage {index + 1} est invalide."})
			attrs["initial_damages"] = damages
		return attrs

	def _save_category_daily_rate(self, vehicle, daily_rate):
		if daily_rate is None:
			return

		category = vehicle.category
		if category.daily_rate != daily_rate:
			category.daily_rate = daily_rate
			category.save(update_fields=["daily_rate", "updated_at"])

	@transaction.atomic
	def create(self, validated_data):
		daily_rate = validated_data.pop("category_daily_rate", None)
		energy_level = validated_data.pop("initial_energy_level_percent")
		damages = validated_data.pop("initial_damages", [])
		damage_photos = validated_data.pop("initial_damage_photos", [])
		reference_photos = {
			field_name: validated_data.pop(field_name)
			for field_name in self.REFERENCE_PHOTO_FIELDS
		}
		validated_data["status"] = Vehicle.Status.DISPONIBLE
		vehicle = super().create(validated_data)
		self._save_category_daily_rate(vehicle, daily_rate)

		now = timezone.now()
		inspection = Inspection.objects.create(
			vehicle=vehicle,
			inspection_type=Inspection.Type.REFERENCE,
			status=Inspection.Status.TERMINE,
			mileage=vehicle.mileage,
			energy_level_percent=energy_level,
			started_at=now,
			completed_at=now,
			completed_by=self.context["request"].user,
		)

		for field_name, (photo_type, position) in self.REFERENCE_PHOTO_FIELDS.items():
			InspectionPhoto.objects.create(
				inspection=inspection,
				photo_type=photo_type,
				position=position,
				file=reference_photos[field_name],
			)

		created_damage_photos = [
			InspectionPhoto.objects.create(
				inspection=inspection,
				photo_type=InspectionPhoto.PhotoType.DOMMAGE,
				position=index + 1,
				file=photo,
			)
			for index, photo in enumerate(damage_photos)
		]
		for damage_data in damages:
			damage = Damage.objects.create(
				inspection=inspection,
				vehicle=vehicle,
				reported_by=self.context["request"].user,
				description=damage_data["description"].strip(),
				severity=damage_data["severity"],
				location="Etat initial du vehicule",
				is_new=False,
				status=Damage.Status.CONFIRME,
			)
			photo_index = damage_data.get("photo_index")
			if photo_index is not None:
				damage.evidence_photos.add(created_damage_photos[photo_index])

		has_grave_damage = any(damage["severity"] == Damage.Severity.GRAVE for damage in damages)
		has_acceptable_damage = any(damage["severity"] == Damage.Severity.ACCEPTABLE for damage in damages)
		if has_grave_damage:
			vehicle.status = Vehicle.Status.A_CONTROLER
			vehicle.has_urgent_checkin_anomaly = True
			vehicle.needs_supervision = False
			vehicle.save(update_fields=["status", "has_urgent_checkin_anomaly", "needs_supervision", "updated_at"])
		elif has_acceptable_damage:
			vehicle.needs_supervision = True
			vehicle.save(update_fields=["needs_supervision", "updated_at"])

		return vehicle

	def update(self, instance, validated_data):
		daily_rate = validated_data.pop("category_daily_rate", None)
		vehicle = super().update(instance, validated_data)
		self._save_category_daily_rate(vehicle, daily_rate)
		return vehicle

	def to_representation(self, instance):
		data = super().to_representation(instance)
		data["category_daily_rate"] = str(instance.category.daily_rate)
		return data


class VehicleStatusUpdateSerializer(serializers.Serializer):
	status = serializers.ChoiceField(choices=Vehicle.Status.choices)
	reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

	def validate(self, attrs):
		vehicle = self.context["vehicle"]
		new_status = attrs["status"]
		current_status = vehicle.status

		if current_status == Vehicle.Status.LOUE and new_status == Vehicle.Status.DISPONIBLE:
			raise serializers.ValidationError(
				{"status": "Transition interdite: un vehicule loue ne peut pas devenir disponible directement."}
			)

		if current_status == Vehicle.Status.MAINTENANCE and new_status == Vehicle.Status.DISPONIBLE:
			has_completed_mechanical_intervention = Intervention.objects.filter(
				vehicle=vehicle,
				intervention_type=Intervention.Type.MECANIQUE,
				status=Intervention.Status.TERMINEE,
			).exists()
			if not has_completed_mechanical_intervention:
				raise serializers.ValidationError(
					{
						"status": "Transition interdite: un vehicule en maintenance ne peut pas devenir disponible sans controle metier."
					}
				)

		if current_status in {Vehicle.Status.ACCIDENTE, Vehicle.Status.A_CONTROLER} and new_status == Vehicle.Status.RESERVE:
			raise serializers.ValidationError(
				{"status": "Transition interdite: ce vehicule ne peut pas etre reserve dans son etat actuel."}
			)

		return attrs
