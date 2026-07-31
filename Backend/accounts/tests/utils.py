from django.contrib.auth import get_user_model

from accounts.models import Role


def ensure_roles():
    labels = {
        Role.Code.CLIENT: "Client",
        Role.Code.GESTIONNAIRE_COMPTABLE: "Gestionnaire comptable",
        Role.Code.ADMINISTRATEUR: "Administrateur",
        Role.Code.MECANICIEN: "Mecanicien",
        Role.Code.NETTOYEUR: "Nettoyeur",
    }

    roles = {}
    for code, default_label in labels.items():
        role, _ = Role.objects.get_or_create(
            code=code,
            defaults={
                "label": default_label,
                "description": f"Role {default_label}",
                "is_active": True,
            },
        )
        if not role.is_active:
            role.is_active = True
            role.save(update_fields=["is_active"])
        roles[code] = role
    return roles


def create_user(*, email, password, role, email_verified=True, is_active=True, is_superuser=False):
    user_model = get_user_model()
    return user_model.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        last_name="User",
        phone="0102030405",
        role=role,
        email_verified=email_verified,
        is_active=is_active,
        is_superuser=is_superuser,
        is_staff=is_superuser,
    )
