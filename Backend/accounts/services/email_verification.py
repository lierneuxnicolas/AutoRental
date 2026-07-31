from django.conf import settings
from django.core.mail import send_mail
from django.core.signing import BadSignature, SignatureExpired, dumps, loads

from accounts.models import User
from notifications.services import create_notification

EMAIL_VERIFICATION_SALT = "accounts.email-verification"


class EmailVerificationError(Exception):
    pass


class InvalidEmailVerificationToken(EmailVerificationError):
    pass


class ExpiredEmailVerificationToken(EmailVerificationError):
    pass


class AlreadyUsedEmailVerificationToken(EmailVerificationError):
    pass


def generate_email_verification_token(user):
    payload = {
        "user_id": user.id,
        "email": user.email,
    }
    return dumps(payload, salt=EMAIL_VERIFICATION_SALT)


def send_verification_email(user, request=None):
    token = generate_email_verification_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "") or ""
    verify_url = f"{frontend_url.rstrip('/')}/verify-email?token={token}"

    send_mail(
        subject="Confirmez votre adresse e-mail AutoRental",
        message=(
            "Bienvenue sur AutoRental.\n\n"
            "Confirmez votre adresse e-mail en ouvrant ce lien :\n"
            f"{verify_url}\n"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[user.email],
        fail_silently=False,
    )


def verify_email_verification_token(token):
    try:
        payload = loads(
            token,
            salt=EMAIL_VERIFICATION_SALT,
            max_age=settings.EMAIL_VERIFICATION_MAX_AGE,
        )
    except SignatureExpired as exc:
        raise ExpiredEmailVerificationToken("Le lien de confirmation a expire.") from exc
    except BadSignature as exc:
        raise InvalidEmailVerificationToken("Le jeton de confirmation est invalide.") from exc

    user_id = payload.get("user_id")
    token_email = payload.get("email")
    if not user_id or not token_email:
        raise InvalidEmailVerificationToken("Le jeton de confirmation est invalide.")

    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise InvalidEmailVerificationToken("Le jeton de confirmation est invalide.")

    if user.email_verified:
        raise AlreadyUsedEmailVerificationToken("Ce lien de confirmation a deja ete utilise.")

    if not user.is_active:
        raise InvalidEmailVerificationToken("Le jeton de confirmation est invalide.")

    if user.email.lower() != str(token_email).lower():
        raise InvalidEmailVerificationToken("Le jeton de confirmation est invalide.")

    user.email_verified = True
    user.save(update_fields=["email_verified"])

    create_notification(
        user=user,
        notification_type="EMAIL_VERIFIED",
        title="Adresse e-mail confirmee",
        message="Votre adresse e-mail AutoRental a ete confirmee.",
    )

    return user
