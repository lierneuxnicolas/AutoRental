from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory, VehicleEquipment


class Command(BaseCommand):
    help = "Create or update GetACar demo fleet in an idempotent way."

    parking_name = "GetACar Demo Fleet Parking"
    parking_address = "12 Rue des Mobilites, 1000 Bruxelles"

    category_definitions = {
        "Citadine": {
            "description": "Categorie citadine de demonstration GetACar.",
            "daily_rate": Decimal("59.00"),
            "hourly_rate": Decimal("8.00"),
            "minimum_deposit": Decimal("500.00"),
            "minimum_rental_hours": 1,
            "is_active": True,
        },
        "Familiale": {
            "description": "Categorie familiale de demonstration GetACar.",
            "daily_rate": Decimal("89.00"),
            "hourly_rate": Decimal("12.00"),
            "minimum_deposit": Decimal("500.00"),
            "minimum_rental_hours": 1,
            "is_active": True,
        },
        "Superieure": {
            "description": "Categorie superieure de demonstration GetACar.",
            "daily_rate": Decimal("119.00"),
            "hourly_rate": Decimal("16.00"),
            "minimum_deposit": Decimal("500.00"),
            "minimum_rental_hours": 1,
            "is_active": True,
        },
        "Utilitaire compact": {
            "description": "Categorie utilitaire compact de demonstration GetACar.",
            "daily_rate": Decimal("99.00"),
            "hourly_rate": Decimal("14.00"),
            "minimum_deposit": Decimal("500.00"),
            "minimum_rental_hours": 1,
            "is_active": True,
        },
        "Grand utilitaire": {
            "description": "Categorie grand utilitaire de demonstration GetACar.",
            "daily_rate": Decimal("129.00"),
            "hourly_rate": Decimal("18.00"),
            "minimum_deposit": Decimal("500.00"),
            "minimum_rental_hours": 1,
            "is_active": True,
        },
    }

    equipment_catalog = {
        "climatisation": "Climatisation",
        "gps": "GPS",
        "bluetooth": "Bluetooth / CarPlay",
        "radar": "Radar / camera recul",
        "regulateur": "Regulateur / limiteur",
        "isofix": "ISOFIX",
        "usb": "USB",
    }

    vehicle_definitions = (
        {
            "code": "CLIO",
            "registration_number": "GAC-CLIO-001",
            "model_name": "Clio",
            "recommended_use": "Ville, economique et facile a conduire",
            "category_name": "Citadine",
            "energy_type": "Essence",
            "transmission": "Manuelle",
            "seats": 5,
            "doors": 5,
            "power_hp": 90,
            "consumption": Decimal("5.20"),
            "euro_standard": "Euro 6",
            "equipment_codes": ["climatisation", "gps", "bluetooth", "radar", "regulateur", "isofix", "usb"],
        },
        {
            "code": "AUSTRAL",
            "registration_number": "GAC-AUS-001",
            "model_name": "Austral",
            "recommended_use": "Famille, confortable et polyvalente",
            "category_name": "Familiale",
            "energy_type": "Hybride essence",
            "transmission": "Automatique",
            "seats": 5,
            "doors": 5,
            "power_hp": 160,
            "consumption": Decimal("5.20"),
            "euro_standard": "Euro 6",
            "equipment_codes": ["climatisation", "gps", "bluetooth", "radar", "regulateur", "isofix", "usb"],
        },
        {
            "code": "RAFALE",
            "registration_number": "GAC-RAF-001",
            "model_name": "Rafale",
            "recommended_use": "Confort superieur et longs trajets",
            "category_name": "Superieure",
            "energy_type": "Hybride essence",
            "transmission": "Automatique",
            "seats": 5,
            "doors": 5,
            "power_hp": 200,
            "consumption": Decimal("4.70"),
            "euro_standard": "Euro 6",
            "equipment_codes": ["climatisation", "gps", "bluetooth", "radar", "regulateur", "isofix", "usb"],
        },
        {
            "code": "KANGOO",
            "registration_number": "GAC-KAN-001",
            "model_name": "Kangoo Van",
            "recommended_use": "Petits transports professionnels",
            "category_name": "Utilitaire compact",
            "energy_type": "Diesel",
            "transmission": "Manuelle",
            "seats": 2,
            "doors": 4,
            "power_hp": 100,
            "consumption": Decimal("6.50"),
            "euro_standard": "Euro 6",
            "equipment_codes": ["climatisation", "gps", "bluetooth", "radar", "regulateur"],
        },
        {
            "code": "MASTER",
            "registration_number": "GAC-MAS-001",
            "model_name": "Master",
            "recommended_use": "Gros volumes et demenagements",
            "category_name": "Grand utilitaire",
            "energy_type": "Diesel",
            "transmission": "Manuelle",
            "seats": 3,
            "doors": 4,
            "power_hp": 130,
            "consumption": Decimal("8.00"),
            "euro_standard": "Euro 6",
            "equipment_codes": ["climatisation", "gps", "bluetooth", "radar", "regulateur"],
        },
    )

    common_vehicle_fields = {
        "year": 2026,
        "color": "Gris",
        "mileage": 0,
        "trunk_volume": None,
        "included_km_per_day": 200,
        "extra_km_price": Decimal("0.25"),
        "minimum_age": 18,
        "required_license": "Permis B",
        "status": Vehicle.Status.DISPONIBLE,
        "is_active": True,
        "description": (
            "Demo GetACar. Documents valides obligatoires. Restitution carburant au niveau initial. "
            "Retard: 15 EUR par heure commencee. Annulation gratuite a 24h minimum, sinon 30% du montant total. "
            "Etat des lieux depart et retour obligatoires."
        ),
    }

    def handle(self, *args: Any, **options: Any) -> None:
        with transaction.atomic():
            brand, _ = Brand.objects.update_or_create(
                name="Renault",
                defaults={"is_active": True},
            )

            parking, _ = Parking.objects.update_or_create(
                name=self.parking_name,
                defaults={
                    "address": self.parking_address,
                    "latitude": Decimal("50.846600"),
                    "longitude": Decimal("4.352800"),
                    "capacity": 50,
                    "is_active": True,
                },
            )

            categories = self._seed_categories()
            equipment_by_code = self._seed_equipment_catalog()

            rows: list[tuple[str, int]] = []
            for definition in self.vehicle_definitions:
                parking_space, _ = ParkingSpace.objects.update_or_create(
                    parking=parking,
                    number=f"GAC-{definition['code']}",
                    defaults={"is_active": True},
                )

                vehicle_defaults = {
                    "brand": brand,
                    "category": categories[definition["category_name"]],
                    "parking_space": parking_space,
                    "model_name": definition["model_name"],
                    "year": self.common_vehicle_fields["year"],
                    "color": self.common_vehicle_fields["color"],
                    "energy_type": definition["energy_type"],
                    "transmission": definition["transmission"],
                    "seats": definition["seats"],
                    "doors": definition["doors"],
                    "mileage": self.common_vehicle_fields["mileage"],
                    "power_hp": definition["power_hp"],
                    "consumption": definition["consumption"],
                    "trunk_volume": self.common_vehicle_fields["trunk_volume"],
                    "euro_standard": definition["euro_standard"],
                    "included_km_per_day": self.common_vehicle_fields["included_km_per_day"],
                    "extra_km_price": self.common_vehicle_fields["extra_km_price"],
                    "minimum_age": self.common_vehicle_fields["minimum_age"],
                    "required_license": self.common_vehicle_fields["required_license"],
                    "recommended_use": definition["recommended_use"],
                    "status": self.common_vehicle_fields["status"],
                    "description": self.common_vehicle_fields["description"],
                    "is_active": self.common_vehicle_fields["is_active"],
                }

                vehicle, _ = Vehicle.objects.update_or_create(
                    registration_number=definition["registration_number"],
                    defaults=vehicle_defaults,
                )

                vehicle.equipment.set([equipment_by_code[code] for code in definition["equipment_codes"]])
                rows.append((vehicle.model_name, vehicle.id))

        self.stdout.write(self.style.SUCCESS("GetACar demo fleet seeded (idempotent)."))
        self.stdout.write("")
        for model_name, vehicle_id in rows:
            self.stdout.write(f"{model_name}: {vehicle_id}")

    def _seed_categories(self) -> dict[str, VehicleCategory]:
        categories: dict[str, VehicleCategory] = {}
        for name, defaults in self.category_definitions.items():
            category, _ = VehicleCategory.objects.update_or_create(
                name=name,
                defaults=defaults,
            )
            categories[name] = category
        return categories

    def _seed_equipment_catalog(self) -> dict[str, VehicleEquipment]:
        equipment_by_code: dict[str, VehicleEquipment] = {}
        for code, label in self.equipment_catalog.items():
            equipment, _ = VehicleEquipment.objects.update_or_create(
                code=code,
                defaults={
                    "label": label,
                    "is_active": True,
                },
            )
            equipment_by_code[code] = equipment
        return equipment_by_code
