import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import DomainEvent

logger = logging.getLogger(__name__)


MAX_DOMAIN_EVENT_RETRIES = 3
SUPPORTED_EVENT_TYPES = {
    "OrderCreatedEvent",
    "VendorOrderCreatedEvent",
    "PaymentPendingEvent",
    "PaymentCompletedEvent",
    "PaymentFailedEvent",
}


def _dispatch_event_payload(event: DomainEvent):
    """Dispatch a domain event payload to downstream integrations.

    This function is intentionally small for now; we validate event types and
    keep the persistence/retry behavior in the task layer.
    """
    if event.event_type not in SUPPORTED_EVENT_TYPES:
        raise ValueError(f"Unsupported domain event type: {event.event_type}")


@shared_task
def process_domain_event(event_id: int):
    with transaction.atomic():
        event = DomainEvent.objects.select_for_update().filter(pk=event_id).first()
        if event is None:
            logger.info("domain_event_missing", extra={"event_id": event_id})
            return {"status": "missing"}

        if event.status == DomainEvent.Status.PROCESSED:
            logger.info(
                "domain_event_already_processed",
                extra={"event_id": event.id, "event_type": event.event_type},
            )
            return {"status": "already_processed"}

        if event.status == DomainEvent.Status.FAILED and event.retry_count >= MAX_DOMAIN_EVENT_RETRIES:
            logger.warning(
                "domain_event_terminal_failed",
                extra={
                    "event_id": event.id,
                    "event_type": event.event_type,
                    "retry_count": event.retry_count,
                },
            )
            return {"status": "terminal_failed"}

        try:
            _dispatch_event_payload(event)
            event.status = DomainEvent.Status.PROCESSED
            event.processed_at = timezone.now()
            event.error_message = ""
            event.save(update_fields=["status", "processed_at", "error_message", "updated_at"])
            logger.info(
                "domain_event_processed",
                extra={"event_id": event.id, "event_type": event.event_type},
            )
            return {"status": "processed", "event_type": event.event_type}
        except Exception as exc:
            event.retry_count += 1
            event.error_message = str(exc)[:255]

            if event.retry_count >= MAX_DOMAIN_EVENT_RETRIES:
                event.status = DomainEvent.Status.FAILED
                logger.error(
                    "domain_event_failed_max_retries",
                    extra={
                        "event_id": event.id,
                        "event_type": event.event_type,
                        "retry_count": event.retry_count,
                        "error_message": event.error_message,
                    },
                )
            else:
                logger.warning(
                    "domain_event_retry_scheduled",
                    extra={
                        "event_id": event.id,
                        "event_type": event.event_type,
                        "retry_count": event.retry_count,
                        "error_message": event.error_message,
                    },
                )

            event.save(update_fields=["retry_count", "status", "error_message", "updated_at"])
            return {
                "status": "failed",
                "event_type": event.event_type,
                "retry_count": event.retry_count,
            }


@shared_task
def dispatch_pending_domain_events(batch_size: int = 100):
    if batch_size <= 0:
        logger.info("domain_event_dispatch_skipped", extra={"batch_size": batch_size})
        return {"queued": 0, "event_ids": []}

    pending_ids = list(
        DomainEvent.objects.filter(
            status=DomainEvent.Status.PENDING,
            retry_count__lt=MAX_DOMAIN_EVENT_RETRIES,
        )
        .order_by("created_at")
        .values_list("id", flat=True)[:batch_size]
    )

    for event_id in pending_ids:
        process_domain_event.delay(event_id)

    logger.info(
        "domain_event_dispatch_queued",
        extra={"queued": len(pending_ids), "batch_size": batch_size},
    )

    return {"queued": len(pending_ids), "event_ids": pending_ids}
