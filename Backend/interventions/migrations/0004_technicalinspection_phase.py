from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("interventions", "0003_remove_intervention_interv_started_at_only_in_progress_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="technicalinspection",
            name="phase",
            field=models.CharField(
                choices=[("INITIAL", "Initial"), ("FINAL", "Final")],
                default="INITIAL",
                max_length=16,
            ),
        ),
        migrations.AddIndex(
            model_name="technicalinspection",
            index=models.Index(fields=["intervention", "phase"], name="tech_insp_interv_phase_idx"),
        ),
    ]