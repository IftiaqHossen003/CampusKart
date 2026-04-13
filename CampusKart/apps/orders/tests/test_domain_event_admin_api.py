from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import DomainEvent, Order


class DomainEventAdminApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            email="admin-events@example.com",
            password="StrongPass123!",
            full_name="Admin Events",
            role="admin",
            is_verified=True,
        )
        self.buyer = user_model.objects.create_user(
            email="buyer-events@example.com",
            password="StrongPass123!",
            full_name="Buyer Events",
            role="student",
            is_verified=True,
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm 100",
        )

        self.failed_event = DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            order=self.order,
            status=DomainEvent.Status.FAILED,
            retry_count=3,
            error_message="timeout",
        )
        self.pending_event = DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            order=self.order,
            status=DomainEvent.Status.PENDING,
        )

    def _auth_admin(self):
        self.client.force_authenticate(user=self.admin)

    def _auth_buyer(self):
        self.client.force_authenticate(user=self.buyer)

    def test_admin_can_list_failed_events(self):
        self._auth_admin()

        response = self.client.get("/api/v1/orders/domain-events/?status=failed")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.failed_event.id)
        self.assertEqual(results[0]["status"], DomainEvent.Status.FAILED)

    def test_non_admin_cannot_list_domain_events(self):
        self._auth_buyer()

        response = self.client.get("/api/v1/orders/domain-events/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.orders.views.process_domain_event.delay")
    def test_admin_retry_failed_event_resets_and_queues(self, mocked_delay):
        self._auth_admin()

        response = self.client.post(
            f"/api/v1/orders/domain-events/{self.failed_event.id}/retry/",
            {"force_reset": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        mocked_delay.assert_called_once_with(self.failed_event.id)

        self.failed_event.refresh_from_db()
        self.assertEqual(self.failed_event.status, DomainEvent.Status.PENDING)
        self.assertEqual(self.failed_event.retry_count, 0)
        self.assertEqual(self.failed_event.error_message, "")

    @patch("apps.orders.views.process_domain_event.delay")
    def test_retry_processed_event_is_rejected(self, mocked_delay):
        processed_event = DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            order=self.order,
            status=DomainEvent.Status.PROCESSED,
        )
        self._auth_admin()

        response = self.client.post(
            f"/api/v1/orders/domain-events/{processed_event.id}/retry/",
            {"force_reset": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mocked_delay.assert_not_called()
