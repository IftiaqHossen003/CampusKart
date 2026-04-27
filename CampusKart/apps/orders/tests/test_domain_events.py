from unittest.mock import patch

from django.test import TestCase

from apps.orders.models import DomainEvent
from apps.orders.tasks import (
    MAX_DOMAIN_EVENT_RETRIES,
    dispatch_pending_domain_events,
    process_domain_event,
)


class DomainEventTaskTests(TestCase):
    def test_process_marks_supported_event_processed(self):
        event = DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            payload={"order_id": 123},
        )

        result = process_domain_event(event.id)

        event.refresh_from_db()
        self.assertEqual(result["status"], "processed")
        self.assertEqual(event.status, DomainEvent.Status.PROCESSED)
        self.assertEqual(event.retry_count, 0)
        self.assertEqual(event.error_message, "")
        self.assertIsNotNone(event.processed_at)

    def test_unknown_event_retries_then_transitions_to_failed(self):
        event = DomainEvent.objects.create(
            event_type="UnknownEvent",
            payload={"foo": "bar"},
        )

        for expected_retry in range(1, MAX_DOMAIN_EVENT_RETRIES + 1):
            result = process_domain_event(event.id)
            event.refresh_from_db()

            self.assertEqual(result["status"], "failed")
            self.assertEqual(event.retry_count, expected_retry)
            self.assertIn("Unsupported domain event type", event.error_message)

        self.assertEqual(event.status, DomainEvent.Status.FAILED)

        terminal_result = process_domain_event(event.id)
        event.refresh_from_db()

        self.assertEqual(terminal_result["status"], "terminal_failed")
        self.assertEqual(event.status, DomainEvent.Status.FAILED)
        self.assertEqual(event.retry_count, MAX_DOMAIN_EVENT_RETRIES)

    @patch("apps.orders.tasks.process_domain_event.delay")
    def test_dispatch_queues_only_pending_events_with_retries_left(self, mocked_delay):
        first = DomainEvent.objects.create(event_type="OrderCreatedEvent")
        second = DomainEvent.objects.create(
            event_type="PaymentPendingEvent",
            retry_count=MAX_DOMAIN_EVENT_RETRIES - 1,
        )
        DomainEvent.objects.create(
            event_type="PaymentFailedEvent",
            retry_count=MAX_DOMAIN_EVENT_RETRIES,
        )
        DomainEvent.objects.create(
            event_type="PaymentCompletedEvent",
            status=DomainEvent.Status.PROCESSED,
        )
        DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            status=DomainEvent.Status.FAILED,
            retry_count=1,
        )

        result = dispatch_pending_domain_events(batch_size=10)

        self.assertEqual(result["queued"], 2)
        self.assertEqual(result["event_ids"], [first.id, second.id])
        self.assertEqual(mocked_delay.call_count, 2)
        mocked_delay.assert_any_call(first.id)
        mocked_delay.assert_any_call(second.id)

    @patch("apps.orders.tasks.process_domain_event.delay")
    def test_dispatch_does_not_queue_failed_events(self, mocked_delay):
        failed_event = DomainEvent.objects.create(
            event_type="OrderCreatedEvent",
            status=DomainEvent.Status.FAILED,
            retry_count=MAX_DOMAIN_EVENT_RETRIES,
        )

        result = dispatch_pending_domain_events(batch_size=10)

        self.assertEqual(result["queued"], 0)
        self.assertEqual(result["event_ids"], [])
        mocked_delay.assert_not_called()
        failed_event.refresh_from_db()
        self.assertEqual(failed_event.status, DomainEvent.Status.FAILED)