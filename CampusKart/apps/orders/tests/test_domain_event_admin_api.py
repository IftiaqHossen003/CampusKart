from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import DomainEvent, DomainEventAdminAudit, Order


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

    def test_admin_can_list_events_with_ordering(self):
        self._auth_admin()
        older = DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            order=self.order,
            status=DomainEvent.Status.PENDING,
        )
        newer = DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            order=self.order,
            status=DomainEvent.Status.FAILED,
        )
        DomainEvent.objects.filter(pk=older.pk).update(created_at=timezone.now() - timedelta(minutes=5))
        DomainEvent.objects.filter(pk=newer.pk).update(created_at=timezone.now() - timedelta(minutes=1))

        response = self.client.get("/api/v1/orders/domain-events/?ordering=created_at")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertLessEqual(results[0]["created_at"], results[-1]["created_at"])

    def test_admin_can_get_domain_event_summary(self):
        DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            order=self.order,
            status=DomainEvent.Status.PROCESSED,
        )
        DomainEvent.objects.create(
            event_type="VendorOrderCreatedEvent",
            order=self.order,
            status=DomainEvent.Status.PENDING,
        )

        self._auth_admin()
        response = self.client.get("/api/v1/orders/domain-events/summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total", response.data)
        self.assertIn("status_counts", response.data)
        self.assertIn("top_event_types", response.data)
        self.assertGreaterEqual(response.data["status_counts"]["failed"], 1)

    def test_non_admin_cannot_list_domain_events(self):
        self._auth_buyer()

        response = self.client.get("/api/v1/orders/domain-events/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_view_domain_event_summary(self):
        self._auth_buyer()
        response = self.client.get("/api/v1/orders/domain-events/summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_view_domain_event_audit_logs(self):
        self._auth_buyer()
        response = self.client.get("/api/v1/orders/domain-events/audit/")
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

        audit = DomainEventAdminAudit.objects.filter(
            action=DomainEventAdminAudit.Action.RETRY_SINGLE,
            event_id=self.failed_event.id,
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_id, self.admin.id)
        self.assertEqual(audit.result.get("queued"), 1)

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

    @patch("apps.orders.views.process_domain_event.delay")
    def test_admin_bulk_retry_failed_events_with_limit(self, mocked_delay):
        another_failed = DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            order=self.order,
            status=DomainEvent.Status.FAILED,
            retry_count=3,
            error_message="bank timeout",
        )

        self._auth_admin()
        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "event_type": "PaymentCompletedEvent",
                "limit": 1,
                "force_reset": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["selected"], 1)
        self.assertEqual(response.data["queued"], 1)
        self.assertEqual(len(response.data["event_ids"]), 1)
        mocked_delay.assert_called_once()

        queued_id = response.data["event_ids"][0]
        refreshed = DomainEvent.objects.get(pk=queued_id)
        self.assertEqual(refreshed.status, DomainEvent.Status.PENDING)
        self.assertEqual(refreshed.retry_count, 0)
        self.assertEqual(refreshed.error_message, "")

        another_failed.refresh_from_db()
        self.assertEqual(another_failed.status, DomainEvent.Status.FAILED)

    @patch("apps.orders.views.process_domain_event.delay")
    def test_bulk_retry_without_force_reset_skips_failed(self, mocked_delay):
        self._auth_admin()
        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "force_reset": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["selected"], 1)
        self.assertEqual(response.data["queued"], 0)
        self.assertEqual(response.data["skipped_failed"], 1)
        mocked_delay.assert_not_called()

    def test_non_admin_cannot_bulk_retry_events(self):
        self._auth_buyer()
        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.orders.views.process_domain_event.delay")
    def test_bulk_retry_dry_run_does_not_mutate_or_queue(self, mocked_delay):
        self._auth_admin()
        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "force_reset": True,
                "dry_run": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["dry_run"])
        self.assertEqual(response.data["selected"], 1)
        self.assertEqual(response.data["queued"], 1)
        mocked_delay.assert_not_called()

        self.failed_event.refresh_from_db()
        self.assertEqual(self.failed_event.status, DomainEvent.Status.FAILED)
        self.assertEqual(self.failed_event.retry_count, 3)

    @patch("apps.orders.views.process_domain_event.delay")
    def test_bulk_retry_created_before_filters_candidates(self, mocked_delay):
        older = DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            order=self.order,
            status=DomainEvent.Status.FAILED,
            retry_count=3,
            error_message="old timeout",
        )
        newer = DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            order=self.order,
            status=DomainEvent.Status.FAILED,
            retry_count=3,
            error_message="new timeout",
        )

        cutoff = timezone.now() - timedelta(seconds=1)
        DomainEvent.objects.filter(pk=older.pk).update(created_at=cutoff - timedelta(seconds=10))
        DomainEvent.objects.filter(pk=newer.pk).update(created_at=cutoff + timedelta(seconds=10))

        self._auth_admin()
        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "event_type": "PaymentCompletedEvent",
                "created_before": cutoff.isoformat(),
                "force_reset": True,
                "limit": 10,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn(older.id, response.data["event_ids"])
        self.assertNotIn(newer.id, response.data["event_ids"])
        mocked_delay.assert_any_call(older.id)
        newer.refresh_from_db()
        self.assertEqual(newer.status, DomainEvent.Status.FAILED)

    @patch("apps.orders.views.process_domain_event.delay")
    def test_bulk_retry_creates_audit_record(self, mocked_delay):
        self._auth_admin()

        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "force_reset": True,
                "limit": 5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        audit = DomainEventAdminAudit.objects.filter(action=DomainEventAdminAudit.Action.RETRY_BULK).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_id, self.admin.id)
        self.assertEqual(audit.filters.get("status"), "failed")
        self.assertEqual(audit.result.get("queued"), response.data.get("queued"))

    @patch("apps.orders.views.process_domain_event.delay")
    def test_dry_run_bulk_retry_creates_dry_run_audit_record(self, mocked_delay):
        self._auth_admin()

        response = self.client.post(
            "/api/v1/orders/domain-events/retry/",
            {
                "status": "failed",
                "force_reset": True,
                "dry_run": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        audit = DomainEventAdminAudit.objects.filter(action=DomainEventAdminAudit.Action.RETRY_BULK_DRY_RUN).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_id, self.admin.id)
        self.assertTrue(audit.filters.get("dry_run"))

    def test_admin_can_list_domain_event_audit_logs(self):
        DomainEventAdminAudit.objects.create(
            actor=self.admin,
            action=DomainEventAdminAudit.Action.RETRY_SINGLE,
            event_id=self.failed_event.id,
            filters={"force_reset": True},
            result={"queued": 1},
        )
        self._auth_admin()

        response = self.client.get("/api/v1/orders/domain-events/audit/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertGreaterEqual(len(results), 1)
        self.assertIn("action", results[0])
        self.assertIn("actor_email", results[0])
