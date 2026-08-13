from django.db import migrations


STANDARD_EQUIPMENT = [
	{"code": "climatisation", "label": "Climatisation"},
	{"code": "gps", "label": "GPS"},
	{"code": "bluetooth", "label": "Bluetooth / CarPlay"},
	{"code": "radar", "label": "Radar / camera recul"},
	{"code": "regulateur", "label": "Regulateur / limiteur"},
	{"code": "isofix", "label": "ISOFIX"},
	{"code": "usb", "label": "USB"},
]


def seed_vehicle_equipment(apps, schema_editor):
	vehicle_equipment_model = apps.get_model("vehicles", "VehicleEquipment")
	for item in STANDARD_EQUIPMENT:
		vehicle_equipment_model.objects.get_or_create(
			code=item["code"],
			defaults={"label": item["label"], "is_active": True},
		)


class Migration(migrations.Migration):

	dependencies = [
		("vehicles", "0003_vehicle_consumption_vehicle_euro_standard_and_more"),
	]

	operations = [
		migrations.RunPython(seed_vehicle_equipment, migrations.RunPython.noop),
	]
