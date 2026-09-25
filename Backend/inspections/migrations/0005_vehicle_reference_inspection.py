import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("inspections", "0004_alter_damage_severity"),
        ("vehicles", "0007_vehicle_has_urgent_checkin_anomaly"),
    ]

    operations = [
        migrations.AlterField(
            model_name="inspection",
            name="inspection_type",
            field=models.CharField(
                choices=[("REFERENCE", "Reference vehicule"), ("INITIAL", "Initial"), ("FINAL", "Final")],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="inspection",
            name="reservation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="inspections",
                to="reservations.reservation",
            ),
        ),
        migrations.AddField(
            model_name="inspection",
            name="vehicle",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reference_inspections",
                to="vehicles.vehicle",
            ),
        ),
        migrations.AddField(
            model_name="inspection",
            name="general_condition",
            field=models.CharField(
                blank=True,
                choices=[("BON", "Bon"), ("A_SURVEILLER", "A surveiller"), ("MAUVAIS", "Mauvais")],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="inspection",
            constraint=models.UniqueConstraint(
                fields=("vehicle", "inspection_type"),
                name="insp_unique_vehicle_reference",
            ),
        ),
        migrations.AddConstraint(
            model_name="inspection",
            constraint=models.CheckConstraint(
                condition=(
                    Q(inspection_type="REFERENCE", reservation__isnull=True, vehicle__isnull=False)
                    | (~Q(inspection_type="REFERENCE") & Q(reservation__isnull=False, vehicle__isnull=True))
                ),
                name="insp_reference_parent_consistency",
            ),
        ),
    ]