from __future__ import annotations

from typing import Any

from .models import DomainEvent, Order, VendorOrder


def emit_domain_event(
    *,
    event_type: str,
    payload: dict[str, Any] | None = None,
    order: Order | None = None,
    vendor_order: VendorOrder | None = None,
    idempotency_key: str | None = None,
) -> DomainEvent:
    payload_data = payload or {}

    if idempotency_key:
        event, _ = DomainEvent.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                "event_type": event_type,
                "order": order,
                "vendor_order": vendor_order,
                "payload": payload_data,
            },
        )
        return event

    return DomainEvent.objects.create(
        event_type=event_type,
        order=order,
        vendor_order=vendor_order,
        payload=payload_data,
    )
