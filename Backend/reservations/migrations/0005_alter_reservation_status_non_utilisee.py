from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0004_reservation_review_resolved_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="reservation",
            name="status",
            field=models.CharField(
                choices=[
                    ("BROUILLON", "Brouillon"),
                    ("EN_ATTENTE_CAUTION", "En attente caution"),
                    ("EN_ATTENTE_PAIEMENT", "En attente paiement"),
                    ("CONFIRMEE", "Confirmee"),
                    ("REAFFECTATION_REQUIRED", "A reaffecter"),
                    ("EN_COURS", "En cours"),
                    ("A_CONTROLER", "A controler"),
                    ("TERMINEE", "Terminee"),
                    ("NON_UTILISEE", "Non utilisee"),
                    ("ANNULEE", "Annulee"),
                    ("PAIEMENT_ECHOUE", "Paiement echoue"),
                ],
                default="BROUILLON",
                max_length=24,
            ),
        ),
    ]