from django.contrib.auth import get_user_model
from django.utils import timezone

from notifications.models import Notification


def _clean_text(value, *, field_name: str) -> str:
    if value is None:
        raise ValueError(f"{field_name} is required")
    cleaned = str(value).strip()
    if not cleaned:
        raise ValueError(f"{field_name} cannot be empty")
    return cleaned


def _validate_notification_type(notification_type: str) -> str:
    cleaned = _clean_text(notification_type, field_name="notification_type")
    max_length = Notification._meta.get_field("notification_type").max_length
    if max_length is not None and len(cleaned) > max_length:
        raise ValueError(f"notification_type cannot exceed {max_length} characters")
    return cleaned


def _validate_user_instance(user):
    if user is None:
        raise ValueError("user is required")

    user_pk = getattr(user, "pk", None)
    if user_pk is None:
        raise ValueError("user must be a persisted instance")

    user_model = get_user_model()
    if not user_model._default_manager.filter(pk=user_pk).exists():
        raise ValueError("user does not exist")

    return user


def _prepare_related_object_id(related_object_id):
    if related_object_id is None:
        return None

    try:
        normalized_id = int(related_object_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("related_object_id must be an integer") from exc

    if normalized_id <= 0:
        raise ValueError("related_object_id must be greater than 0")

    return normalized_id


def create_notification(
    *,
    user: object,
    notification_type: str,
    title: str,
    message: str,
    related_object_type: str | None = None,
    related_object_id: int | None = None,
) -> Notification:
    """Create and persist one notification for an existing user."""
    validated_user = _validate_user_instance(user)
    validated_type = _validate_notification_type(notification_type)
    cleaned_title = _clean_text(title, field_name="title")
    cleaned_message = _clean_text(message, field_name="message")
    normalized_related_object_type = (
        None if related_object_type is None else str(related_object_type).strip() or None
    )
    normalized_related_object_id = _prepare_related_object_id(related_object_id)

    return Notification.objects.create(
        user=validated_user,
        notification_type=validated_type,
        title=cleaned_title,
        message=cleaned_message,
        related_object_type=normalized_related_object_type,
        related_object_id=normalized_related_object_id,
    )


def create_notifications(
    *,
    users,
    notification_type,
    title,
    message,
    related_object_type=None,
    related_object_id=None,
):
    validated_type = _validate_notification_type(notification_type)
    cleaned_title = _clean_text(title, field_name="title")
    cleaned_message = _clean_text(message, field_name="message")
    normalized_related_object_type = (
        None if related_object_type is None else str(related_object_type).strip() or None
    )
    normalized_related_object_id = _prepare_related_object_id(related_object_id)

    unique_users_by_pk = {}
    for user in users or []:
        if user is None:
            continue
        validated_user = _validate_user_instance(user)
        unique_users_by_pk[validated_user.pk] = validated_user

    unique_users = list(unique_users_by_pk.values())
    if not unique_users:
        return []

    notifications = [
        Notification(
            user=user,
            notification_type=validated_type,
            title=cleaned_title,
            message=cleaned_message,
            related_object_type=normalized_related_object_type,
            related_object_id=normalized_related_object_id,
        )
        for user in unique_users
    ]
    return Notification.objects.bulk_create(notifications)


def notify_users_with_roles(
    *,
    role_codes,
    notification_type,
    title,
    message,
    related_object_type=None,
    related_object_id=None,
):
    from accounts.models import Role

    if role_codes is None:
        raise ValueError("role_codes is required")

    valid_role_codes = set(Role.Code.values)
    normalized_role_codes = {
        str(role_code).strip()
        for role_code in role_codes
        if role_code is not None and str(role_code).strip()
    }
    invalid_codes = sorted(code for code in normalized_role_codes if code not in valid_role_codes)
    if invalid_codes:
        raise ValueError("role_codes contains invalid values")

    if not normalized_role_codes:
        return []

    user_model = get_user_model()
    users = list(
        user_model._default_manager.select_related("role").filter(
            is_active=True,
            role__is_active=True,
            role__code__in=normalized_role_codes,
        )
    )
    return create_notifications(
        users=users,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )


def mark_notification_as_read(*, notification, user):
    if notification is None:
        raise ValueError("notification is required")

    validated_user = _validate_user_instance(user)
    if notification.user_id != validated_user.pk:
        raise ValueError("Cannot mark another user's notification as read")

    if notification.is_read:
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return notification

    notification.is_read = True
    notification.read_at = timezone.now()
    notification.save(update_fields=["is_read", "read_at"])
    return notification


def mark_all_notifications_as_read(*, user):
    validated_user = _validate_user_instance(user)
    now = timezone.now()
    updated_count = Notification.objects.filter(
        user_id=validated_user.pk,
        is_read=False,
    ).update(
        is_read=True,
        read_at=now,
    )
    return updated_count
