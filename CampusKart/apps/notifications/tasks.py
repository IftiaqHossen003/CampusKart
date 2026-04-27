from celery import shared_task


@shared_task(bind=True, max_retries=3)
def create_notification(self, user_id: int, type: str, title: str, message: str, link: str = ""):
    """Create an in-app notification for the provided user."""
    from django.contrib.auth import get_user_model

    from .models import Notification

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
        Notification.objects.create(
            user=user,
            type=type,
            title=title,
            message=message,
            link=link,
        )
    except User.DoesNotExist as exc:
        raise self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def send_push_notification(self, user_id: int, title: str, body: str, data: dict = None):
    """Backward-compatible wrapper around create_notification."""
    link = ""
    if isinstance(data, dict):
        link = str(data.get("link") or "")
    return create_notification(user_id, "system", title, body, link)
