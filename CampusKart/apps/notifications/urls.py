from django.urls import path
from .views import (
    MarkAllReadView,
    MarkNotificationReadView,
    NotificationListView,
    NotificationUnreadCountView,
)

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("unread-count/", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("<int:id>/read/", MarkNotificationReadView.as_view(), name="notification-mark-read"),
    path("mark-all-read/", MarkAllReadView.as_view(), name="notification-mark-all-read"),
]
