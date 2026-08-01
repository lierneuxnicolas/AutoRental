import django_filters

from vehicles.models import Vehicle


class VehiclePublicFilter(django_filters.FilterSet):
	category = django_filters.NumberFilter(field_name="category_id")
	brand = django_filters.NumberFilter(field_name="brand_id")
	status = django_filters.ChoiceFilter(field_name="status", choices=Vehicle.Status.choices)

	class Meta:
		model = Vehicle
		fields = ["category", "brand", "status"]
