from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="insurance_type",
            field=models.CharField(
                choices=[
                    ("STANDARD", "Standard"),
                    ("DUO", "Duo"),
                    ("OMNIUM", "Omnium"),
                ],
                default="STANDARD",
                max_length=20,
            ),
        ),
    ]
