from notifications.models import Notification


def create_notification(
    *,
    user,
    notification_type,
    title,
    message,
    related_object_type=None,
    related_object_id=None,
):
    if user is None:
        raise ValueError("user is required")

    return Notification.objects.create(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
    )
