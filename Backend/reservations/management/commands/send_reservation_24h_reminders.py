from django.core.management.base import BaseCommand

from reservations.services.reminders import send_reservation_24h_reminders


class Command(BaseCommand):
    help = "Envoie les rappels e-mail 24h avant début pour les réservations confirmées."

    def add_arguments(self, parser):
        parser.add_argument(
            "--lookahead-hours",
            type=int,
            default=24,
            help="Nombre d'heures avant début pour cibler les réservations.",
        )
        parser.add_argument(
            "--window-minutes",
            type=int,
            default=60,
            help="Taille de la fenêtre de sélection en minutes.",
        )

    def handle(self, *args, **options):
        sent_count = send_reservation_24h_reminders(
            lookahead_hours=options["lookahead_hours"],
            window_minutes=options["window_minutes"],
        )
        self.stdout.write(self.style.SUCCESS(f"Rappels envoyés: {sent_count}"))
