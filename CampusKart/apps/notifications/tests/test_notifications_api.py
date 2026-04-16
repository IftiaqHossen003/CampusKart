from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "notifications-tests-cache",
        }
    }
)
class NotificationsApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="notify-user@example.com",
            password="StrongPass123!",
            full_name="Notify User",
            role="student",
            is_verified=True,
        )
        self.other_user = user_model.objects.create_user(
            email="notify-other@example.com",
            password="StrongPass123!",
            full_name="Notify Other",
            role="student",
            is_verified=True,
        )

        self.list_url = "/api/v1/notifications/"

    def test_list_returns_users_notifications_ordered_by_date(self):
        older = Notification.objects.create(
            user=self.user,
            type=Notification.Type.SYSTEM,
            title="Old",
            message="Old message",
        )
        newer = Notification.objects.create(
            user=self.user,
            type=Notification.Type.ORDER,
            title="New",
            message="New message",
        )
        Notification.objects.create(
            user=self.other_user,
            type=Notification.Type.SYSTEM,
            title="Other",
            message="Other message",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], newer.id)
        self.assertEqual(results[1]["id"], older.id)

    def test_patch_read_marks_only_owned_notification(self):
        notification = Notification.objects.create(
            user=self.user,
            type=Notification.Type.SYSTEM,
            title="Read me",
            message="Please read",
        )
        other = Notification.objects.create(
            user=self.other_user,
            type=Notification.Type.SYSTEM,
            title="Other",
            message="Other",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.patch(f"/api/v1/notifications/{notification.id}/read/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        notification.refresh_from_db()
        self.assertTrue(notification.is_read)

        forbidden_response = self.client.patch(f"/api/v1/notifications/{other.id}/read/", {}, format="json")
        self.assertEqual(forbidden_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_all_read_marks_unread_only_for_current_user(self):
        first = Notification.objects.create(
            user=self.user,
            type=Notification.Type.ORDER,
            title="First",
            message="First",
            is_read=False,
        )
        second = Notification.objects.create(
            user=self.user,
            type=Notification.Type.PAYMENT,
            title="Second",
            message="Second",
            is_read=False,
        )
        other = Notification.objects.create(
            user=self.other_user,
            type=Notification.Type.SYSTEM,
            title="Other",
            message="Other",
            is_read=False,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/v1/notifications/mark-all-read/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        first.refresh_from_db()
        second.refresh_from_db()
        other.refresh_from_db()
        self.assertTrue(first.is_read)
        self.assertTrue(second.is_read)
        self.assertFalse(other.is_read)
