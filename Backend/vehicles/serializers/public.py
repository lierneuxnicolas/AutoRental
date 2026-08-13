from django.conf import settings
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from accounts.models import ClientDocument
from inspections.services.departure import MANDATORY_PHOTO_TYPES
from reservations.services.cancellation import get_cancellable_statuses
from vehicles.models import Parking, Vehicle, VehicleCategory, VehicleEquipment
from vehicles.services import AvailabilityValidationError, validate_availability_period


class VehiclePhotoPublicSerializer(serializers.Serializer):
	id = serializers.IntegerField(read_only=True)
	file = serializers.ImageField(read_only=True)
	caption = serializers.CharField(read_only=True)
	position = serializers.IntegerField(read_only=True)


@extend_schema_serializer(
	examples=[
		{
			"start": "2030-01-01T10:00:00+01:00",
			"end": "2030-01-01T13:00:00+01:00",
		}
	]
)
class VehicleAvailabilityQuerySerializer(serializers.Serializer):
	start = serializers.DateTimeField(
		error_messages={
			"required": "Le parametre start est obligatoire.",
			"invalid": "Le parametre start doit etre un datetime ISO 8601 valide.",
		}
	)
	end = serializers.DateTimeField(
		error_messages={
			"required": "Le parametre end est obligatoire.",
			"invalid": "Le parametre end doit etre un datetime ISO 8601 valide.",
		}
	)

	def validate(self, attrs):
		minimum_hours = self.context.get("minimum_hours")
		try:
			period = validate_availability_period(
				start=attrs["start"],
				end=attrs["end"],
				minimum_hours=minimum_hours,
			)
		except AvailabilityValidationError as exc:
			if exc.code in {"END_BEFORE_START", "DURATION_TOO_SHORT"}:
				raise serializers.ValidationError({"end": [str(exc)]})
			if exc.code == "START_IN_PAST":
				raise serializers.ValidationError({"start": [str(exc)]})
			raise serializers.ValidationError({"non_field_errors": [str(exc)]})
		return period


class VehicleEquipmentPublicSerializer(serializers.ModelSerializer):
	class Meta:
		model = VehicleEquipment
		fields = ["id", "code", "label"]


class VehiclePublicSerializer(serializers.ModelSerializer):
	brand = serializers.CharField(source="brand.name", read_only=True)
	category = serializers.CharField(source="category.name", read_only=True)
	fuel_type = serializers.CharField(source="energy_type", read_only=True)
	public_status = serializers.CharField(source="status", read_only=True)
	category_daily_rate = serializers.DecimalField(
		source="category.daily_rate",
		max_digits=10,
		decimal_places=2,
		read_only=True,
	)
	equipment = serializers.SerializerMethodField()
	main_photo = serializers.SerializerMethodField()
	photos = serializers.SerializerMethodField()
	parking_name = serializers.SerializerMethodField()
	parking_address = serializers.SerializerMethodField()
	parking_space_number = serializers.SerializerMethodField()

	class Meta:
		model = Vehicle
		fields = [
			"id",
			"brand",
			"model_name",
			"category",
			"year",
			"color",
			"fuel_type",
			"transmission",
			"seats",
			"doors",
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
			"public_status",
			"category_daily_rate",
			"equipment",
			"main_photo",
			"photos",
			"parking_name",
			"parking_address",
			"parking_space_number",
		]

	def _can_expose_exact_location(self, obj: Vehicle) -> bool:
		if obj.status != Vehicle.Status.DISPONIBLE:
			return False
		space = getattr(obj, "parking_space", None)
		if space is None:
			return False
		parking = getattr(space, "parking", None)
		if parking is None:
			return False
		return bool(space.is_active and parking.is_active)

	@extend_schema_field(VehicleEquipmentPublicSerializer(many=True))
	def get_equipment(self, obj: Vehicle):
		return VehicleEquipmentPublicSerializer(obj.equipment.all(), many=True, context=self.context).data

	@extend_schema_field(VehiclePhotoPublicSerializer(allow_null=True))
	def get_main_photo(self, obj: Vehicle):
		primary = next((photo for photo in obj.photos.all() if photo.is_primary), None)
		if primary is None:
			primary = next(iter(obj.photos.all()), None)
		if primary is None:
			return None
		return VehiclePhotoPublicSerializer(primary, context=self.context).data

	@extend_schema_field(VehiclePhotoPublicSerializer(many=True))
	def get_photos(self, obj: Vehicle):
		photos = list(obj.photos.all())
		return VehiclePhotoPublicSerializer(photos, many=True, context=self.context).data

	@extend_schema_field(serializers.CharField(allow_null=True))
	def get_parking_name(self, obj: Vehicle):
		if not self._can_expose_exact_location(obj):
			return None
		return obj.parking_space.parking.name

	@extend_schema_field(serializers.CharField(allow_null=True))
	def get_parking_address(self, obj: Vehicle):
		if not self._can_expose_exact_location(obj):
			return None
		return obj.parking_space.parking.address

	@extend_schema_field(serializers.CharField(allow_null=True))
	def get_parking_space_number(self, obj: Vehicle):
		if not self._can_expose_exact_location(obj):
			return None
		return obj.parking_space.number


class VehiclePublicDetailSerializer(VehiclePublicSerializer):
	conditions = serializers.SerializerMethodField()

	class Meta(VehiclePublicSerializer.Meta):
		fields = VehiclePublicSerializer.Meta.fields + ["conditions"]

	@extend_schema_field(
		serializers.DictField(
			child=serializers.JSONField(),
		)
	)
	def get_conditions(self, obj: Vehicle):
		category = getattr(obj, "category", None)
		minimum_deposit = getattr(category, "minimum_deposit", None)

		return {
			"included_km_per_day": obj.included_km_per_day,
			"extra_km_price": obj.extra_km_price,
			"minimum_deposit": minimum_deposit,
			"minimum_age": obj.minimum_age,
			"required_license": obj.required_license,
			"reservation_profile_validation": {
				"documents_must_be_valid": True,
				"required_documents": [
					ClientDocument.DocumentType.CARTE_IDENTITE,
					ClientDocument.DocumentType.PERMIS_CONDUIRE,
				],
			},
			"fuel_tracking": {
				"managed_in_inspections": True,
				"field": "energy_level_percent",
			},
			"late_policy": {
				"managed_in_departure_inspection_window": True,
				"early_tolerance_minutes": settings.DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES,
				"late_tolerance_minutes": settings.DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES,
			},
			"cancellation_policy": {
				"allowed_statuses": sorted(get_cancellable_statuses()),
				"confirmed_requires_future_start": True,
			},
			"inspection_policy": {
				"departure_required": True,
				"return_required": True,
				"mandatory_photo_count": len(MANDATORY_PHOTO_TYPES),
			},
		}


class VehicleCategoryPublicSerializer(serializers.ModelSerializer):
	class Meta:
		model = VehicleCategory
		fields = ["id", "name", "description", "daily_rate"]


class ParkingPublicSerializer(serializers.ModelSerializer):
	public_capacity = serializers.IntegerField(source="capacity", read_only=True)

	class Meta:
		model = Parking
		fields = ["id", "name", "address", "latitude", "longitude", "public_capacity"]
