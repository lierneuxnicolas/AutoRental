from django.core.management.base import BaseCommand, CommandError

from accounts.models import AccountErasureRequest
from accounts.services.erasure_processing import process_closed_account_erasure


class Command(BaseCommand):
    help = "Traite ou reprend l’effacement pour une demande de clôture existante."

    def add_arguments(self, parser):
        parser.add_argument("request_id", type=int)

    def handle(self, *args, **options):
        try:
            erasure = process_closed_account_erasure(options["request_id"])
        except AccountErasureRequest.DoesNotExist as exc:
            raise CommandError("Demande introuvable.") from exc
        if erasure.processing_status != AccountErasureRequest.ProcessingStatus.COMPLETED:
            result = erasure.processing_error or erasure.processing_status
            raise CommandError(f"Effacement incomplet ({result}).")
        self.stdout.write("Effacement traité.")
