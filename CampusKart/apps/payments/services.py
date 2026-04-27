from django.db import transaction
from django.utils import timezone

from apps.orders.events import emit_domain_event
from apps.orders.models import Order

from .models import Payment, VendorPayout


def sync_vendor_payouts_for_payment(*, payment: Payment, payout_status: str) -> list[VendorPayout]:
    """Create or update vendor payout rows from the order's vendor orders."""
    order = payment.order
    vendor_orders = order.vendor_orders.select_related("vendor").all()

    payout_rows = []
    for vendor_order in vendor_orders:
        payout, _ = VendorPayout.objects.get_or_create(
            payment=payment,
            vendor_order=vendor_order,
            defaults={
                "vendor": vendor_order.vendor,
                "gross_amount": vendor_order.subtotal_amount,
                "commission_amount": vendor_order.commission_amount,
                "net_amount": vendor_order.net_vendor_amount,
                "status": payout_status,
                "release_at": timezone.now() if payout_status == VendorPayout.Status.READY else None,
            },
        )

        if payout.status != VendorPayout.Status.PAID:
            payout.vendor = vendor_order.vendor
            payout.gross_amount = vendor_order.subtotal_amount
            payout.commission_amount = vendor_order.commission_amount
            payout.net_amount = vendor_order.net_vendor_amount
            payout.status = payout_status
            payout.release_at = timezone.now() if payout_status == VendorPayout.Status.READY else None
            payout.failure_reason = ""
            payout.save(
                update_fields=[
                    "vendor",
                    "gross_amount",
                    "commission_amount",
                    "net_amount",
                    "status",
                    "release_at",
                    "failure_reason",
                    "updated_at",
                ]
            )

        payout_rows.append(payout)

    return payout_rows


def mark_payment_failed_and_cancel_payouts(*, payment: Payment, reason: str):
    payment.status = Payment.Status.FAILED
    payment.failure_reason = reason
    payment.save(update_fields=["status", "failure_reason", "updated_at"])

    payment.vendor_payouts.exclude(status=VendorPayout.Status.PAID).update(
        status=VendorPayout.Status.CANCELLED,
        failure_reason=reason,
    )


def confirm_vendor_orders_for_parent(*, order: Order):
    order.vendor_orders.filter(status=Order.Status.PENDING).update(
        status=Order.Status.CONFIRMED,
    )


def finalize_cod_on_parent_delivery(*, order: Order):
    """For COD orders, convert pending payment into success after full delivery."""
    payment = getattr(order, "payment", None)
    if payment is None:
        return

    if payment.gateway != Payment.Gateway.COD:
        return

    if payment.status == Payment.Status.SUCCESS:
        return

    if order.status != Order.Status.DELIVERED:
        return

    with transaction.atomic():
        locked_payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if locked_payment.status == Payment.Status.SUCCESS:
            return

        locked_payment.status = Payment.Status.SUCCESS
        locked_payment.failure_reason = ""
        locked_payment.save(update_fields=["status", "failure_reason", "updated_at"])

        sync_vendor_payouts_for_payment(payment=locked_payment, payout_status=VendorPayout.Status.READY)

        emit_domain_event(
            event_type="PaymentCompletedEvent",
            order=order,
            idempotency_key=f"payment-completed:{locked_payment.pk}:{locked_payment.status}",
            payload={
                "payment_id": locked_payment.pk,
                "gateway": locked_payment.gateway,
                "status": locked_payment.status,
                "order_id": order.pk,
                "amount": str(locked_payment.amount),
                "reason": "cod-delivery-finalized",
            },
        )
