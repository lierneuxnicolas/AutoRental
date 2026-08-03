from django.db import transaction

from accounts.models import ClientProfile, Role, User
from accounts.services.email_verification import send_verification_email
from notifications.services import create_notification


class RegistrationError(Exception):
    pass


@transaction.atomic
def register_client_user(*, email, password, first_name, last_name, phone=""):
    client_role = Role.objects.filter(code=Role.Code.CLIENT, is_active=True).first()
    if client_role is None:
        raise RegistrationError("Le role CLIENT est introuvable. Lancez la commande setup_roles.")

    user = User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        role=client_role,
        email_verified=False,
        is_active=True,
    )

    ClientProfile.objects.create(
        user=user,
        profile_status=ClientProfile.ProfileStatus.INCOMPLET,
    )

    transaction.on_commit(
        lambda: create_notification(
            user=user,
            notification_type="ACCOUNT_CREATED",
            title="Compte cree",
            message="Votre compte AutoRental a ete cree. Confirmez votre adresse e-mail.",
        )
    )

    transaction.on_commit(lambda: send_verification_email(user))

    return user
