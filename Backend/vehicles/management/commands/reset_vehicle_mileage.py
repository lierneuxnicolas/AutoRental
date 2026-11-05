import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from vehicles.models import Vehicle


class Command(BaseCommand):
	help = "Set every local development vehicle mileage to 200 km (preview by default)."

	def add_arguments(self, parser):
		parser.add_argument(
			"--apply",
			action="store_true",
			help="Apply the update. Without this option, only show the affected vehicle count.",
		)

	def handle(self, *args, **options):
		self._ensure_local_development_database()

		vehicles_to_update = Vehicle.objects.exclude(mileage=200)
		total_count = Vehicle.objects.count()
		affected_count = vehicles_to_update.count()

		if not options["apply"]:
			self.stdout.write(
				f"Aperçu : {affected_count} véhicule(s) sur {total_count} seraient mis à 200 km. "
				"Aucune modification effectuée."
			)
			return

		with transaction.atomic():
			updated_count = vehicles_to_update.update(mileage=200)

		self.stdout.write(self.style.SUCCESS(f"{updated_count} véhicule(s) mis à 200 km."))

	def _ensure_local_development_database(self):
		database = connections["default"].settings_dict
		if (
			os.environ.get("DJANGO_SETTINGS_MODULE") != "config.settings.local"
			or not settings.DEBUG
			or database.get("HOST") not in {"localhost", "127.0.0.1", "::1"}
		):
			raise CommandError(
				"Cette commande est réservée à une base de développement locale "
				"(config.settings.local, DEBUG actif et hôte loopback)."
			)
