from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_clientdocument_driving_license_transmission_declared"),
    ]

    operations = [
        migrations.AddField(
            model_name="clientdocument",
            name="verified_date_of_birth",
            field=models.DateField(blank=True, null=True),
        ),
    ]
