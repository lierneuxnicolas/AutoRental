from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0005_alter_reservation_status_non_utilisee"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="cancellation_source",
            field=models.CharField(
                blank=True,
                choices=[("CLIENT", "Client"), ("GESTIONNAIRE", "Gestionnaire"), ("SYSTEME", "Systeme")],
                max_length=20,
                null=True,
            ),
        ),
    ]