from celery import shared_task
from django.conf import settings


@shared_task(bind=True, max_retries=3)
def send_push_notification(self, user_id: int, title: str, body: str, data: dict = None):
    """Celery task: send a push notification to a user."""
    from .models import Notification
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
        Notification.objects.create(
            recipient=user,
            notification_type="system",
            title=title,
            body=body,
            data=data or {},
        )
        # TODO: integrate FCM / APNs here
    except User.DoesNotExist as exc:
        raise self.retry(exc=exc, countdown=60)
