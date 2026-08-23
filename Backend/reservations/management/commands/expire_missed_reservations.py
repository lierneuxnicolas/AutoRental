from django.core.management.base import BaseCommand

from reservations.services.expiration import expire_missed_reservations


class Command(BaseCommand):
    help = "Annule automatiquement les reservations CONFIRMEE dont la fenetre de depart est depassee sans inspection INITIAL."

    def handle(self, *args, **options):
        stats = expire_missed_reservations()
        self.stdout.write(
            self.style.SUCCESS(
                "Reservations analysees={analyzed} annulees={cancelled} ignorees={ignored} erreurs={errors}".format(
                    analyzed=stats.analyzed,
                    cancelled=stats.cancelled,
                    ignored=stats.ignored,
                    errors=stats.errors,
                )
            )
        )
