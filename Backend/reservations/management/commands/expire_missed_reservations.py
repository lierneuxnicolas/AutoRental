from django.core.management.base import BaseCommand

from reservations.services.expiration import expire_missed_reservations, expire_stale_draft_reservations


class Command(BaseCommand):
    help = (
        "Annule automatiquement les reservations CONFIRMEE dont la fenetre de depart est depassee sans "
        "inspection INITIAL, et les reservations BROUILLON dont le delai de 15 minutes est depasse."
    )

    def handle(self, *args, **options):
        missed_stats = expire_missed_reservations()
        self.stdout.write(
            self.style.SUCCESS(
                "Reservations manquees: analysees={analyzed} annulees={cancelled} ignorees={ignored} erreurs={errors}".format(
                    analyzed=missed_stats.analyzed,
                    cancelled=missed_stats.cancelled,
                    ignored=missed_stats.ignored,
                    errors=missed_stats.errors,
                )
            )
        )

        draft_stats = expire_stale_draft_reservations()
        self.stdout.write(
            self.style.SUCCESS(
                "Brouillons expires: analysees={analyzed} annulees={cancelled} ignorees={ignored} erreurs={errors}".format(
                    analyzed=draft_stats.analyzed,
                    cancelled=draft_stats.cancelled,
                    ignored=draft_stats.ignored,
                    errors=draft_stats.errors,
                )
            )
        )
