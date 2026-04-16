from django.urls import path
from .views import NotificationListView, MarkAllReadView, MarkNotificationReadView

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("<int:id>/read/", MarkNotificationReadView.as_view(), name="notification-mark-read"),
    path("mark-all-read/", MarkAllReadView.as_view(), name="notification-mark-all-read"),
]
