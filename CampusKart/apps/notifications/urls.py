from django.urls import path
from .views import NotificationListView, MarkAllReadView

app_name = "notifications"

urlpatterns = [
    path("",           NotificationListView.as_view(), name="notification-list"),
    path("mark-read/", MarkAllReadView.as_view(),      name="mark-read"),
]
