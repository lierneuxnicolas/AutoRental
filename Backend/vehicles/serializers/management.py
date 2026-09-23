from datetime import date

from rest_framework import serializers

from interventions.models import Intervention
from vehicles.models import Brand, ParkingSpace, Vehicle, VehicleCategory, VehicleEquipment


def _normalize_registration(value: str) -> str:
	return " ".join(value.split()).upper()


class VehicleManagementWriteSerializer(serializers.ModelSerializer):
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
	status = serializers.ChoiceField(choices=Vehicle.Status.choices)

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
		return attrs

	def _save_category_daily_rate(self, vehicle, daily_rate):
		if daily_rate is None:
			return

		category = vehicle.category
		if category.daily_rate != daily_rate:
			category.daily_rate = daily_rate
			category.save(update_fields=["daily_rate", "updated_at"])

	def create(self, validated_data):
		daily_rate = validated_data.pop("category_daily_rate", None)
		vehicle = super().create(validated_data)
		self._save_category_daily_rate(vehicle, daily_rate)
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
