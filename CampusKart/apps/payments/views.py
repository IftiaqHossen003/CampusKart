import hashlib
import hmac
import time
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification
from apps.orders.models import Order, VendorOrder
from apps.orders.events import emit_domain_event

from .models import Payment, VendorPayout
from .serializers import (
    InitiatePaymentSerializer,
    PaymentSerializer,
    VendorPayoutMarkPaidSerializer,
    VendorPayoutSerializer,
)
from .services import confirm_vendor_orders_for_parent, sync_vendor_payouts_for_payment


def _extract_payload(request):
    data = request.data
    if hasattr(data, "dict"):
        return data.dict()
    if isinstance(data, dict):
        return data
    return {}


def _payment_webhook_fingerprint(payload: dict) -> str:
    parts = [
        str(payload.get("tran_id") or "").strip(),
        str(payload.get("status") or payload.get("payment_status") or "").strip(),
        str(payload.get("amount") or "").strip(),
        str(payload.get("currency") or "").strip(),
        str(payload.get("val_id") or "").strip(),
    ]
    fingerprint_input = "|".join(parts)
    return hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest()


def _md5_hexdigest(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()


def _is_valid_sslcommerz_signature(payload: dict) -> bool:
    store_password = str(getattr(settings, "SSLCOMMERZ_STORE_PASSWORD", "") or "").strip()
    verify_sign = str(payload.get("verify_sign") or "").strip().lower()
    verify_key = str(payload.get("verify_key") or "").strip()
    if not store_password or not verify_sign or not verify_key:
        return False

    params = {}
    for key in [part.strip() for part in verify_key.split(",") if part.strip()]:
        params[key] = str(payload.get(key) or "").strip()

    params["store_passwd"] = _md5_hexdigest(store_password)
    query_string = "&".join(f"{key}={params[key]}" for key in sorted(params.keys()))
    generated_sign = _md5_hexdigest(query_string)
    return hmac.compare_digest(generated_sign, verify_sign)


def _decimal_from_payload(value) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _notify_order_confirmed(order: Order):
    Notification.objects.create(
        recipient=order.buyer,
        notification_type=Notification.Type.ORDER,
        title="Order confirmed",
        body=f"Order {order.order_number} is confirmed.",
        data={
            "event": "order_confirmed",
            "order_id": order.pk,
            "order_number": str(order.order_number),
        },
    )


class PaymentListView(generics.ListAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)


class InitiatePaymentView(APIView):
    """POST /api/v1/payments/initiate/ — create payment record & call gateway."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = InitiatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data if isinstance(serializer.validated_data, dict) else {}

        order_id = validated_data.get("order_id")
        gateway = validated_data.get("gateway")
        idempotency_key = validated_data.get("idempotency_key")

        if order_id is None or gateway is None:
            raise ValidationError({"detail": "order_id and gateway are required."})

        order = get_object_or_404(
            Order,
            pk=order_id,
            buyer=request.user,
        )

        if order.status in {Order.Status.CANCELLED, Order.Status.REFUNDED}:
            raise ValidationError({"detail": "Payment cannot be initiated for this order state."})

        if idempotency_key:
            existing_by_key = Payment.objects.filter(
                user=request.user,
                idempotency_key=idempotency_key,
            ).select_related("order").first()

            if existing_by_key:
                if existing_by_key.order.pk != order.pk:
                    raise ValidationError({"detail": "idempotency_key already belongs to a different order."})

                return Response(
                    {
                        "detail": "Payment already initiated.",
                        "payment": PaymentSerializer(existing_by_key).data,
                    },
                    status=status.HTTP_200_OK,
                )

        payment_defaults = {
            "user": request.user,
            "gateway": gateway,
            "amount": order.total_amount,
            "currency": "BDT",
            "status": Payment.Status.INITIATED,
        }
        if idempotency_key:
            payment_defaults["idempotency_key"] = idempotency_key

        payment, created = Payment.objects.get_or_create(order=order, defaults=payment_defaults)

        if payment.user.pk != request.user.pk:
            raise ValidationError({"detail": "Invalid payment owner."})

        if not created and payment.status == Payment.Status.SUCCESS:
            return Response(
                {
                    "detail": "Order is already paid.",
                    "payment": PaymentSerializer(payment).data,
                },
                status=status.HTTP_200_OK,
            )

        if idempotency_key and not payment.idempotency_key:
            payment.idempotency_key = idempotency_key

        if gateway == Payment.Gateway.COD:
            payment.gateway = Payment.Gateway.COD
            payment.amount = order.total_amount
            payment.currency = "BDT"
            payment.status = Payment.Status.PENDING
            payment.raw_response = {
                "mode": "cod",
                "initiated_at": timezone.now().isoformat(),
            }
            payment.save(
                update_fields=[
                    "gateway",
                    "idempotency_key",
                    "amount",
                    "currency",
                    "status",
                    "raw_response",
                    "updated_at",
                ]
            )

            sync_vendor_payouts_for_payment(
                payment=payment,
                payout_status=VendorPayout.Status.PENDING,
            )

            if order.status == Order.Status.PENDING:
                order.status = Order.Status.CONFIRMED
                order.save(update_fields=["status", "updated_at"])
                confirm_vendor_orders_for_parent(order=order)
                _notify_order_confirmed(order)

            emit_domain_event(
                event_type="PaymentPendingEvent",
                order=order,
                idempotency_key=f"payment-pending:{payment.pk}:{payment.status}",
                payload={
                    "payment_id": payment.pk,
                    "gateway": payment.gateway,
                    "status": payment.status,
                    "order_id": order.pk,
                    "amount": str(payment.amount),
                },
            )

            return Response(
                {
                    "detail": "COD payment recorded.",
                    "payment": PaymentSerializer(payment).data,
                },
                status=status.HTTP_201_CREATED,
            )

        # SSLCommerz path: create and return a gateway intent payload.
        transaction_id = f"CK-{order.pk}-{int(time.time())}"
        init_url = getattr(settings, "SSLCOMMERZ_INIT_URL", "").strip()
        success_url = getattr(settings, "SSLCOMMERZ_SUCCESS_URL", "").strip()
        fail_url = getattr(settings, "SSLCOMMERZ_FAIL_URL", "").strip()
        cancel_url = getattr(settings, "SSLCOMMERZ_CANCEL_URL", "").strip()

        payment.gateway = Payment.Gateway.SSLCOMMERZ
        payment.amount = order.total_amount
        payment.currency = "BDT"
        payment.status = Payment.Status.PENDING
        payment.gateway_order_id = transaction_id
        payment.raw_response = {
            "mode": "sslcommerz",
            "transaction_id": transaction_id,
            "init_url": init_url,
            "success_url": success_url,
            "fail_url": fail_url,
            "cancel_url": cancel_url,
        }
        payment.save(
            update_fields=[
                "gateway",
                "idempotency_key",
                "amount",
                "currency",
                "status",
                "gateway_order_id",
                "raw_response",
                "updated_at",
            ]
        )

        sync_vendor_payouts_for_payment(
            payment=payment,
            payout_status=VendorPayout.Status.PENDING,
        )

        return Response(
            {
                "detail": "SSLCommerz payment initiated.",
                "payment": PaymentSerializer(payment).data,
                "transaction_id": transaction_id,
                "gateway_url": init_url,
                "success_url": success_url,
                "fail_url": fail_url,
                "cancel_url": cancel_url,
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentWebhookView(APIView):
    """POST /api/v1/payments/webhook/ — receive gateway callbacks."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        payload = _extract_payload(request)
        tran_id = str(payload.get("tran_id") or payload.get("transaction_id") or "").strip()
        if not tran_id:
            return Response({"detail": "Missing transaction id."}, status=status.HTTP_400_BAD_REQUEST)

        configured_store_id = str(getattr(settings, "SSLCOMMERZ_STORE_ID", "") or "").strip()
        incoming_store_id = str(payload.get("store_id") or "").strip()
        if configured_store_id and incoming_store_id and configured_store_id != incoming_store_id:
            return Response({"detail": "Invalid store id."}, status=status.HTTP_400_BAD_REQUEST)

        verify_signature = bool(getattr(settings, "SSLCOMMERZ_VALIDATE_SIGNATURE", True))
        if verify_signature and not _is_valid_sslcommerz_signature(payload):
            return Response({"detail": "Invalid callback signature."}, status=status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.filter(
            gateway=Payment.Gateway.SSLCOMMERZ,
            gateway_order_id=tran_id,
        ).select_related("order").first()

        if payment is None:
            return Response({"detail": "Unknown transaction ignored."}, status=status.HTTP_200_OK)

        fingerprint = _payment_webhook_fingerprint(payload)
        terminal_statuses = {Payment.Status.SUCCESS, Payment.Status.FAILED}
        if payment.status in terminal_statuses:
            return Response({"detail": "Payment already finalized."}, status=status.HTTP_200_OK)

        if payment.webhook_fingerprint == fingerprint:
            return Response({"detail": "Duplicate webhook ignored."}, status=status.HTTP_200_OK)

        gateway_status = str(payload.get("status") or payload.get("payment_status") or "").strip().lower()
        success_statuses = {"valid", "validated", "success", "succeeded"}
        failure_statuses = {"failed", "fail", "cancelled", "canceled", "invalid"}

        with transaction.atomic():
            payment = Payment.objects.select_for_update().select_related("order").get(pk=payment.pk)
            if payment.status in terminal_statuses:
                return Response({"detail": "Payment already finalized."}, status=status.HTTP_200_OK)

            if payment.webhook_fingerprint == fingerprint:
                return Response({"detail": "Duplicate webhook ignored."}, status=status.HTTP_200_OK)

            payment.callback_received_at = timezone.now()
            payment.webhook_fingerprint = fingerprint
            payment.raw_response = payload

            if gateway_status in success_statuses:
                callback_amount = _decimal_from_payload(payload.get("amount"))
                callback_currency = str(payload.get("currency") or "").strip().upper()
                expected_amount = Decimal(str(payment.amount))
                expected_currency = str(payment.currency or "").strip().upper()

                if callback_amount is None or callback_amount != expected_amount:
                    payment.status = Payment.Status.FAILED
                    payment.failure_reason = "Callback amount mismatch"
                elif callback_currency and callback_currency != expected_currency:
                    payment.status = Payment.Status.FAILED
                    payment.failure_reason = "Callback currency mismatch"
                else:
                    payment.status = Payment.Status.SUCCESS
                    payment.failure_reason = ""
                    payment.gateway_payment_id = str(payload.get("val_id") or payload.get("bank_tran_id") or "")

                    if payment.order.status == Order.Status.PENDING:
                        payment.order.status = Order.Status.CONFIRMED
                        payment.order.save(update_fields=["status", "updated_at"])
                        confirm_vendor_orders_for_parent(order=payment.order)
                        _notify_order_confirmed(payment.order)
            elif gateway_status in failure_statuses:
                payment.status = Payment.Status.FAILED
                payment.failure_reason = str(
                    payload.get("failedreason")
                    or payload.get("error")
                    or payload.get("status")
                    or "Payment failed"
                )
            else:
                payment.status = Payment.Status.PENDING

            if payment.status == Payment.Status.FAILED and payment.order.status == Order.Status.PENDING:
                payment.order.status = Order.Status.CANCELLED
                payment.order.save(update_fields=["status", "updated_at"])
                VendorOrder.objects.filter(
                    order=payment.order,
                    status__in=[Order.Status.PENDING, Order.Status.CONFIRMED]
                ).update(status=Order.Status.CANCELLED)

            payment.save(
                update_fields=[
                    "status",
                    "gateway_payment_id",
                    "webhook_fingerprint",
                    "callback_received_at",
                    "failure_reason",
                    "raw_response",
                    "updated_at",
                ]
            )

            if payment.status == Payment.Status.SUCCESS:
                sync_vendor_payouts_for_payment(
                    payment=payment,
                    payout_status=VendorPayout.Status.READY,
                )
                emit_domain_event(
                    event_type="PaymentCompletedEvent",
                    order=payment.order,
                    idempotency_key=f"payment-completed:{payment.pk}:{payment.gateway_payment_id or payment.gateway_order_id}",
                    payload={
                        "payment_id": payment.pk,
                        "gateway": payment.gateway,
                        "status": payment.status,
                        "order_id": payment.order.pk,
                        "gateway_payment_id": payment.gateway_payment_id,
                        "gateway_order_id": payment.gateway_order_id,
                        "amount": str(payment.amount),
                    },
                )
            elif payment.status == Payment.Status.FAILED:
                VendorPayout.objects.filter(payment=payment).exclude(status=VendorPayout.Status.PAID).update(
                    status=VendorPayout.Status.CANCELLED,
                    failure_reason=payment.failure_reason,
                )
                emit_domain_event(
                    event_type="PaymentFailedEvent",
                    order=payment.order,
                    idempotency_key=f"payment-failed:{payment.pk}:{payment.failure_reason}",
                    payload={
                        "payment_id": payment.pk,
                        "gateway": payment.gateway,
                        "status": payment.status,
                        "order_id": payment.order.pk,
                        "failure_reason": payment.failure_reason,
                        "amount": str(payment.amount),
                    },
                )

        return Response({"detail": "Webhook processed."}, status=status.HTTP_200_OK)


class VendorPayoutListView(generics.ListAPIView):
    serializer_class = VendorPayoutSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = VendorPayout.objects.select_related("payment", "payment__order", "vendor")
        role = getattr(user, "role", "")

        if role == "admin":
            return queryset

        if role != "vendor":
            raise PermissionDenied("Only vendor users can access vendor payouts.")

        vendor_profile = getattr(user, "vendor_profile", None)
        if vendor_profile is None:
            return VendorPayout.objects.none()

        return queryset.filter(vendor=vendor_profile)


class VendorPayoutMarkPaidView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, id: int):
        if getattr(request.user, "role", "") != "admin":
            raise PermissionDenied("Only admin users can mark payouts as paid.")

        payout = get_object_or_404(
            VendorPayout.objects.select_related("payment", "payment__order", "vendor"),
            pk=id,
        )

        serializer = VendorPayoutMarkPaidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data if isinstance(serializer.validated_data, dict) else {}

        payout.status = VendorPayout.Status.PAID
        payout.paid_at = timezone.now()
        payout.release_at = payout.release_at or payout.paid_at
        payout.failure_reason = ""
        payout_reference = validated_data.get("payout_reference")
        if payout_reference is not None:
            payout.payout_reference = payout_reference
        payout.save(
            update_fields=[
                "status",
                "paid_at",
                "release_at",
                "failure_reason",
                "payout_reference",
                "updated_at",
            ]
        )

        return Response(VendorPayoutSerializer(payout).data, status=status.HTTP_200_OK)
