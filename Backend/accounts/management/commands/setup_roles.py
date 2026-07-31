from django.core.management.base import BaseCommand

from accounts.models import Role


class Command(BaseCommand):
    help = "Create or update initial AutoRental roles."

    def handle(self, *args, **options):
        role_definitions = [
            {
                "code": Role.Code.CLIENT,
                "label": "Client",
                "description": (
                    "Utilisateur pouvant gerer son profil, transmettre ses documents "
                    "et effectuer des reservations."
                ),
                "is_active": True,
            },
            {
                "code": Role.Code.GESTIONNAIRE_COMPTABLE,
                "label": "Gestionnaire-comptable",
                "description": (
                    "Gestion des vehicules, documents, reservations, paiements, cautions "
                    "et operations metier."
                ),
                "is_active": True,
            },
            {
                "code": Role.Code.ADMINISTRATEUR,
                "label": "Administrateur",
                "description": (
                    "Administration des utilisateurs, roles, parametres et fonctions "
                    "techniques de la plateforme."
                ),
                "is_active": True,
            },
            {
                "code": Role.Code.MECANICIEN,
                "label": "Mecanicien",
                "description": "Consultation et traitement des interventions mecaniques attribuees.",
                "is_active": True,
            },
            {
                "code": Role.Code.NETTOYEUR,
                "label": "Service de nettoyage",
                "description": "Consultation et traitement des interventions de nettoyage attribuees.",
                "is_active": True,
            },
        ]

        created_count = 0
        existing_or_updated_count = 0

        for definition in role_definitions:
            code = definition["code"]
            payload = {
                "label": definition["label"],
                "description": definition["description"],
                "is_active": definition["is_active"],
            }

            role = Role.objects.filter(code=code).first()
            if role is None:
                Role.objects.create(code=code, **payload)
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"{code}: cree"))
                continue

            changed = False
            for field_name, new_value in payload.items():
                if getattr(role, field_name) != new_value:
                    setattr(role, field_name, new_value)
                    changed = True

            if changed:
                role.save(update_fields=["label", "description", "is_active", "updated_at"])
                self.stdout.write(self.style.WARNING(f"{code}: mis a jour"))
            else:
                self.stdout.write(f"{code}: deja present")

            existing_or_updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Resume: {created_count} role(s) cree(s), {existing_or_updated_count} role(s) existant(s)/mis a jour."
            )
        )
