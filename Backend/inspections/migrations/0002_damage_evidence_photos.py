from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		("inspections", "0001_initial"),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.AddField(
			model_name="damage",
			name="evidence_photos",
			field=models.ManyToManyField(blank=True, related_name="damage_evidence", to="inspections.inspectionphoto"),
		),
	]