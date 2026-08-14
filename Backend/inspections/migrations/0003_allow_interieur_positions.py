from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

	dependencies = [
		("inspections", "0002_damage_evidence_photos"),
	]

	operations = [
		migrations.RemoveConstraint(
			model_name="inspectionphoto",
			name="insp_photo_single_views_pos0",
		),
		migrations.AddConstraint(
			model_name="inspectionphoto",
			constraint=models.CheckConstraint(
				condition=Q(photo_type__in=["DOMMAGE", "AUTRE", "INTERIEUR"]) | Q(position=0),
				name="insp_photo_single_views_pos0",
			),
		),
	]
