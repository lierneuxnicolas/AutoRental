from __future__ import annotations

from datetime import date
from typing import Any

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import ClientDocument, ClientProfile, Role, User


class Command(BaseCommand):
    help = "Create demo AutoRental accounts in an idempotent way."

    demo_password = "DemoAutoRental2026!"

    role_definitions = (
        {
            "code": Role.Code.ADMINISTRATEUR,
            "label": "Administrateur",
            "description": "Compte de demonstration administrateur.",
        },
        {
            "code": Role.Code.GESTIONNAIRE_COMPTABLE,
            "label": "Gestionnaire comptable",
            "description": "Compte de demonstration gestionnaire-comptable.",
        },
        {
            "code": Role.Code.MECANICIEN,
            "label": "Mecanicien",
            "description": "Compte de demonstration mecanicien.",
        },
        {
            "code": Role.Code.NETTOYEUR,
            "label": "Nettoyeur",
            "description": "Compte de demonstration agent de nettoyage.",
        },
        {
            "code": Role.Code.CLIENT,
            "label": "Client",
            "description": "Compte client de demonstration.",
        },
    )

    user_definitions = (
        {
            "label": "Administrateur",
            "email": "admin@autorental.local",
            "role": Role.Code.ADMINISTRATEUR,
            "first_name": "Admin",
            "last_name": "Demo",
            "phone": "0100000001",
            "is_staff": True,
            "is_superuser": True,
            "email_verified": True,
            "kind": "staff",
        },
        {
            "label": "Gestionnaire",
            "email": "manager@autorental.local",
            "role": Role.Code.GESTIONNAIRE_COMPTABLE,
            "first_name": "Manager",
            "last_name": "Demo",
            "phone": "0100000002",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "staff",
        },
        {
            "label": "Mecanicien",
            "email": "mechanic@autorental.local",
            "role": Role.Code.MECANICIEN,
            "first_name": "Mechanic",
            "last_name": "Demo",
            "phone": "0100000003",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "staff",
        },
        {
            "label": "Agent de nettoyage",
            "email": "cleaner@autorental.local",
            "role": Role.Code.NETTOYEUR,
            "first_name": "Cleaner",
            "last_name": "Demo",
            "phone": "0100000004",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "staff",
        },
        {
            "label": "Client valide",
            "email": "client.valid@autorental.local",
            "role": Role.Code.CLIENT,
            "first_name": "Client",
            "last_name": "Valide",
            "phone": "0100000005",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "client_valid",
        },
        {
            "label": "Client incomplet",
            "email": "client.incomplete@autorental.local",
            "role": Role.Code.CLIENT,
            "first_name": "Client",
            "last_name": "Incomplete",
            "phone": "0100000006",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "client_incomplete",
        },
        {
            "label": "Client refuse",
            "email": "client.refused@autorental.local",
            "role": Role.Code.CLIENT,
            "first_name": "Client",
            "last_name": "Refuse",
            "phone": "0100000007",
            "is_staff": False,
            "is_superuser": False,
            "email_verified": True,
            "kind": "client_refused",
        },
    )

    def handle(self, *args: Any, **options: Any) -> None:
        with transaction.atomic():
            roles = self._seed_roles()
            manager = None
            rows = []
            summary_lines = []

            for definition in self.user_definitions:
                if definition["kind"] == "staff":
                    user = self._seed_staff_user(definition, roles)
                else:
                    user = self._seed_client_user(definition, roles)

                if definition["email"] == "manager@autorental.local":
                    manager = user

                profile_status = "-"
                if definition["kind"].startswith("client_"):
                    profile = self._seed_client_profile(user, definition)
                    profile_status = profile.profile_status

                    if definition["kind"] == "client_valid":
                        self._seed_valid_client_documents(profile, manager or user)
                    elif definition["kind"] == "client_refused":
                        self._seed_refused_client_document(profile, manager or user)

                rows.append(
                    {
                        "email": user.email,
                        "role": user.role.code if user.role else "-",
                        "profile_status": profile_status,
                    }
                )
                summary_lines.append(f"✔ {definition['label']} créé ou déjà existant")

        for line in summary_lines:
            self.stdout.write(self.style.SUCCESS(line))

        self.stdout.write("")
        self.stdout.write(f"{'Email':<36}{'Rôle':<28}{'Statut du profil'}")
        for row in rows:
            self.stdout.write(f"{row['email']:<36}{row['role']:<28}{row['profile_status']}")

    def _seed_roles(self) -> dict[str, Role]:
        roles: dict[str, Role] = {}
        for definition in self.role_definitions:
            role, _ = Role.objects.get_or_create(
                code=definition["code"],
                defaults={
                    "label": definition["label"],
                    "description": definition["description"],
                    "is_active": True,
                },
            )
            roles[role.code] = role
        return roles

    def _seed_staff_user(self, definition: dict[str, Any], roles: dict[str, Role]) -> User:
        return self._seed_user(definition, roles, is_superuser=definition["email"] == "admin@autorental.local")

    def _seed_client_user(self, definition: dict[str, Any], roles: dict[str, Role]) -> User:
        return self._seed_user(definition, roles, is_superuser=False)

    def _seed_user(self, definition: dict[str, Any], roles: dict[str, Role], *, is_superuser: bool) -> User:
        role = roles[definition["role"]]
        user, created = User.objects.get_or_create(
            email=definition["email"],
            defaults={
                "first_name": definition["first_name"],
                "last_name": definition["last_name"],
                "phone": definition["phone"],
                "role": role,
                "email_verified": definition["email_verified"],
                "is_active": True,
                "is_staff": definition["is_staff"],
                "is_superuser": is_superuser,
            },
        )

        if created:
            user.set_password(self.demo_password)
            user.save()
            return user

        update_fields = []
        if user.role_id != role.id:
            user.role = role
            update_fields.append("role")
        if user.email_verified != definition["email_verified"]:
            user.email_verified = definition["email_verified"]
            update_fields.append("email_verified")
        if user.is_active is not True:
            user.is_active = True
            update_fields.append("is_active")
        if user.is_staff != definition["is_staff"]:
            user.is_staff = definition["is_staff"]
            update_fields.append("is_staff")
        if user.is_superuser != is_superuser:
            user.is_superuser = is_superuser
            update_fields.append("is_superuser")

        if update_fields:
            user.save(update_fields=update_fields)

        return user

    def _seed_client_profile(self, user: User, definition: dict[str, Any]) -> ClientProfile:
        profile, _ = ClientProfile.objects.get_or_create(
            user=user,
            defaults={
                "date_of_birth": self._default_date_of_birth(definition["kind"]),
                "address": self._default_address(definition["kind"]),
                "profile_status": self._default_profile_status(definition["kind"]),
                "rejection_reason": self._default_rejection_reason(definition["kind"]),
            },
        )
        return profile

    def _default_profile_status(self, kind: str) -> str:
        return {
            "client_valid": ClientProfile.ProfileStatus.VALIDE,
            "client_incomplete": ClientProfile.ProfileStatus.INCOMPLET,
            "client_refused": ClientProfile.ProfileStatus.REFUSE,
        }[kind]

    def _default_date_of_birth(self, kind: str) -> date | None:
        return {
            "client_valid": date(1995, 5, 10),
            "client_incomplete": None,
            "client_refused": date(1990, 2, 14),
        }[kind]

    def _default_address(self, kind: str) -> str:
        return {
            "client_valid": "12 Rue Demo, 75000 Paris",
            "client_incomplete": "",
            "client_refused": "8 Avenue Demo, 69000 Lyon",
        }[kind]

    def _default_rejection_reason(self, kind: str) -> str:
        return {
            "client_valid": "",
            "client_incomplete": "",
            "client_refused": "Document de demonstration refuse.",
        }[kind]

    def _seed_valid_client_documents(self, profile: ClientProfile, validated_by: User) -> None:
        documents = (
            {
                "document_type": ClientDocument.DocumentType.CARTE_IDENTITE,
                "document_number": "CI-DEMO-2026-0001",
                "expiration_date": date(2031, 12, 31),
                "file_name": "carte_identite_demo.pdf",
            },
            {
                "document_type": ClientDocument.DocumentType.PERMIS_CONDUIRE,
                "document_number": "PC-DEMO-2026-0001",
                "expiration_date": date(2032, 12, 31),
                "file_name": "permis_conduire_demo.pdf",
            },
        )

        for definition in documents:
            self._seed_document(
                profile=profile,
                validated_by=validated_by,
                document_type=definition["document_type"],
                document_number=definition["document_number"],
                status=ClientDocument.Status.VALIDE,
                rejection_reason="",
                expiration_date=definition["expiration_date"],
                file_name=definition["file_name"],
            )

    def _seed_refused_client_document(self, profile: ClientProfile, validated_by: User) -> None:
        self._seed_document(
            profile=profile,
            validated_by=validated_by,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="CI-DEMO-2026-REFUSE-1",
            status=ClientDocument.Status.REFUSE,
            rejection_reason="Piece illisible ou incoherente pour la demonstration.",
            expiration_date=date(2030, 12, 31),
            file_name="carte_identite_refusee_demo.pdf",
        )

    def _seed_document(
        self,
        *,
        profile: ClientProfile,
        validated_by: User,
        document_type: str,
        document_number: str,
        status: str,
        rejection_reason: str,
        expiration_date: date,
        file_name: str,
    ) -> None:
        document, created = ClientDocument.objects.get_or_create(
            client=profile,
            document_type=document_type,
            is_active=True,
            defaults={
                "document_number": document_number,
                "file": self._demo_pdf(file_name),
                "expiration_date": expiration_date,
                "status": status,
                "rejection_reason": rejection_reason,
                "validated_by": validated_by,
                "validated_at": None,
                "is_active": True,
            },
        )

        if created:
            return

        if not document.file:
            document.file.save(file_name, self._demo_pdf(file_name), save=True)

    def _demo_pdf(self, file_name: str) -> ContentFile:
        return ContentFile(b"%PDF-1.4\n% Demo AutoRental\n", name=file_name)
