from django.db import transaction
from django.utils import timezone

from accounts.models import ClientProfile, Role, User
from accounts.services.email_verification import send_verification_email
from notifications.services import create_notification


CURRENT_TERMS_VERSION = "1.2"


class RegistrationError(Exception):
    pass


@transaction.atomic
def register_client_user(*, email, password, first_name, last_name, terms_accepted, terms_version, phone=""):
    if terms_accepted is not True or terms_version != CURRENT_TERMS_VERSION:
        raise RegistrationError("Acceptez la version actuelle des conditions générales d’utilisation.")
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
        terms_accepted_at=timezone.now(),
        terms_version=CURRENT_TERMS_VERSION,
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
            message="Votre compte AutoRental a ete cree. Confirmez maintenant votre adresse e-mail.",
            related_object_type="user",
            related_object_id=user.id,
        )
    )

    transaction.on_commit(lambda: send_verification_email(user))

    return user
