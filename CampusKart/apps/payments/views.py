import hashlib
import time
from decimal import Decimal, InvalidOperation
from importlib import import_module
from urllib.parse import quote, urlencode

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
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


SUCCESS_GATEWAY_STATUSES = {"valid", "validated", "success", "succeeded"}
FAILURE_GATEWAY_STATUSES = {"failed", "fail", "cancelled", "canceled", "invalid"}


def _extract_payload(request):
    payload = {}

    query_params = getattr(request, "query_params", None)
    if query_params is not None and hasattr(query_params, "dict"):
        payload.update(query_params.dict())
    elif isinstance(query_params, dict):
        payload.update(query_params)

    data = getattr(request, "data", None)
    if data is not None and hasattr(data, "dict"):
        payload.update(data.dict())
    elif isinstance(data, dict):
        payload.update(data)

    post_data = getattr(request, "POST", None)
    if post_data is not None and hasattr(post_data, "dict"):
        payload.update(post_data.dict())

    return payload


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


def _get_sslcommerz_client():
    try:
        sslcommerz_module = import_module("sslcommerz_lib")
        sslcommerz_client = getattr(sslcommerz_module, "SSLCOMMERZ")
    except ImportError as exc:
        raise ValidationError({"detail": "SSLCommerz library is not installed."}) from exc

    store_id = str(getattr(settings, "SSLCOMMERZ_STORE_ID", "") or "").strip()
    store_password = str(getattr(settings, "SSLCOMMERZ_STORE_PASSWORD", "") or "").strip()
    is_sandbox = bool(getattr(settings, "SSLCOMMERZ_IS_SANDBOX", True))

    if not store_id or not store_password:
        raise ValidationError({"detail": "SSLCommerz credentials are not configured."})

    return sslcommerz_client(
        {
            "store_id": store_id,
            "store_pass": store_password,
            "issandbox": is_sandbox,
        }
    )


def _create_sslcommerz_session(post_body: dict) -> dict:
    client = _get_sslcommerz_client()
    response = client.createSession(post_body)
    return response if isinstance(response, dict) else {}


def _hash_validate_ipn(payload: dict) -> bool:
    client = _get_sslcommerz_client()
    return bool(client.hash_validate_ipn(payload))


def _extract_gateway_url(session_response: dict) -> str:
    for key in ["GatewayPageURL", "gateway_url", "redirectGatewayURL", "redirectGatewayUrl"]:
        value = session_response.get(key)
        if value:
            return str(value).strip()
    return ""


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


def _get_transaction_id(payload: dict) -> str:
    return str(payload.get("tran_id") or payload.get("transaction_id") or "").strip()


def _resolve_frontend_redirect_url(payment: Payment | None, payment_result: str) -> str:
    frontend_base_url = str(getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173") or "").rstrip("/")
    order_number = str(getattr(getattr(payment, "order", None), "order_number", "") or "").strip()

    if order_number:
        path = f"/orders/{quote(order_number)}"
    else:
        path = "/orders"

    query = urlencode(
        {
            "payment": "sslcommerz",
            "payment_result": payment_result,
        }
    )
    return f"{frontend_base_url}{path}?{query}"


def _resolve_payment_result(
    payment: Payment | None,
    gateway_status: str,
    result_hint: str,
    processing_status_code: int,
) -> str:
    payment_status = str(getattr(payment, "status", "") or "").lower()
    status_hint = str(result_hint or "").lower()
    normalized_gateway_status = str(gateway_status or "").lower()

    if payment_status == Payment.Status.SUCCESS:
        return "success"

    if payment_status == Payment.Status.FAILED:
        if normalized_gateway_status in {"cancelled", "canceled"}:
            return "cancelled"
        return "failed"

    if status_hint in {"success", "failed", "cancelled"}:
        return status_hint

    if normalized_gateway_status in SUCCESS_GATEWAY_STATUSES:
        return "success"

    if normalized_gateway_status in {"cancelled", "canceled"}:
        return "cancelled"

    if normalized_gateway_status in FAILURE_GATEWAY_STATUSES:
        return "failed"

    if processing_status_code >= status.HTTP_400_BAD_REQUEST:
        return "failed"

    return "pending"


def _process_sslcommerz_callback(payload: dict, *, enforce_hash: bool) -> tuple[Payment | None, str, int]:
    tran_id = _get_transaction_id(payload)
    if not tran_id:
        return None, "Missing transaction id.", status.HTTP_400_BAD_REQUEST

    configured_store_id = str(getattr(settings, "SSLCOMMERZ_STORE_ID", "") or "").strip()
    incoming_store_id = str(payload.get("store_id") or "").strip()
    if configured_store_id and incoming_store_id and configured_store_id != incoming_store_id:
        return None, "Invalid store id.", status.HTTP_400_BAD_REQUEST

    if enforce_hash:
        try:
            is_valid_hash = _hash_validate_ipn(payload)
        except ValidationError:
            is_valid_hash = False
        except Exception:
            is_valid_hash = False

        if not is_valid_hash:
            return None, "Invalid callback hash.", status.HTTP_400_BAD_REQUEST

    payment = Payment.objects.filter(
        gateway=Payment.Gateway.SSLCOMMERZ,
        gateway_order_id=tran_id,
    ).select_related("order").first()

    if payment is None:
        return None, "Unknown transaction ignored.", status.HTTP_200_OK

    fingerprint = _payment_webhook_fingerprint(payload)
    terminal_statuses = {Payment.Status.SUCCESS, Payment.Status.FAILED}
    if payment.status in terminal_statuses:
        return payment, "Payment already finalized.", status.HTTP_200_OK

    if payment.webhook_fingerprint == fingerprint:
        return payment, "Duplicate webhook ignored.", status.HTTP_200_OK

    gateway_status = str(payload.get("status") or payload.get("payment_status") or "").strip().lower()

    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("order").get(pk=payment.pk)
        if payment.status in terminal_statuses:
            return payment, "Payment already finalized.", status.HTTP_200_OK

        if payment.webhook_fingerprint == fingerprint:
            return payment, "Duplicate webhook ignored.", status.HTTP_200_OK

        payment.callback_received_at = timezone.now()
        payment.webhook_fingerprint = fingerprint
        payment.raw_response = payload

        if gateway_status in SUCCESS_GATEWAY_STATUSES:
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
        elif gateway_status in FAILURE_GATEWAY_STATUSES:
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
                status__in=[Order.Status.PENDING, Order.Status.CONFIRMED],
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

    return payment, "Webhook processed.", status.HTTP_200_OK


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

        # SSLCommerz path: create a gateway session via sslcommerz-lib.
        transaction_id = f"CK-{order.pk}-{int(time.time())}"
        success_url = getattr(settings, "SSLCOMMERZ_SUCCESS_URL", "").strip()
        fail_url = getattr(settings, "SSLCOMMERZ_FAIL_URL", "").strip()
        cancel_url = getattr(settings, "SSLCOMMERZ_CANCEL_URL", "").strip()
        ipn_url = str(getattr(settings, "SSLCOMMERZ_IPN_URL", "") or "").strip()

        if not success_url or not fail_url or not cancel_url:
            raise ValidationError({"detail": "SSLCommerz callback URLs are not configured."})

        customer_name = str(getattr(request.user, "full_name", "") or request.user.email or "CampusKart Customer")
        customer_phone = str(getattr(request.user, "phone", "") or "")
        order_label = str(order.order_number or order.pk)

        session_payload = {
            "total_amount": str(order.total_amount),
            "currency": "BDT",
            "tran_id": transaction_id,
            "success_url": success_url,
            "fail_url": fail_url,
            "cancel_url": cancel_url,
            "cus_name": customer_name,
            "cus_email": str(request.user.email),
            "cus_add1": str(order.delivery_address or "Campus Address"),
            "cus_city": "Dhaka",
            "cus_postcode": "1200",
            "cus_country": "Bangladesh",
            "cus_phone": customer_phone,
            "shipping_method": "NO",
            "product_name": f"CampusKart Order {order_label}",
            "product_category": "Marketplace",
            "product_profile": "general",
        }
        if ipn_url:
            session_payload["ipn_url"] = ipn_url

        payment.gateway = Payment.Gateway.SSLCOMMERZ
        payment.amount = order.total_amount
        payment.currency = "BDT"
        payment.status = Payment.Status.PENDING
        payment.gateway_order_id = transaction_id
        payment.raw_response = {
            "mode": "sslcommerz",
            "transaction_id": transaction_id,
            "request": session_payload,
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

        try:
            session_response = _create_sslcommerz_session(session_payload)
        except ValidationError:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Failed to create SSLCommerz session"
            payment.save(update_fields=["status", "failure_reason", "updated_at"])
            raise
        except Exception as exc:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Failed to create SSLCommerz session"
            payment.save(update_fields=["status", "failure_reason", "updated_at"])
            raise ValidationError({"detail": "SSLCommerz session creation failed."}) from exc

        gateway_url = _extract_gateway_url(session_response)
        if not gateway_url:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Gateway URL missing in SSLCommerz response"
            payment.raw_response = {
                "mode": "sslcommerz",
                "transaction_id": transaction_id,
                "request": session_payload,
                "response": session_response,
            }
            payment.save(update_fields=["status", "failure_reason", "raw_response", "updated_at"])
            raise ValidationError({"detail": "Gateway URL missing in SSLCommerz response."})

        payment.failure_reason = ""
        payment.raw_response = {
            "mode": "sslcommerz",
            "transaction_id": transaction_id,
            "request": session_payload,
            "response": session_response,
            "success_url": success_url,
            "fail_url": fail_url,
            "cancel_url": cancel_url,
        }
        payment.save(update_fields=["failure_reason", "raw_response", "updated_at"])

        sync_vendor_payouts_for_payment(
            payment=payment,
            payout_status=VendorPayout.Status.PENDING,
        )

        return Response(
            {
                "detail": "SSLCommerz payment initiated.",
                "payment": PaymentSerializer(payment).data,
                "transaction_id": transaction_id,
                "gateway_url": gateway_url,
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
        verify_ipn_hash = bool(getattr(settings, "SSLCOMMERZ_VALIDATE_IPN_HASH", True))
        _, detail, response_status = _process_sslcommerz_callback(
            payload,
            enforce_hash=verify_ipn_hash,
        )
        return Response({"detail": detail}, status=response_status)


class PaymentReturnView(APIView):
    """Browser-return endpoint for SSLCommerz redirects."""

    permission_classes = [permissions.AllowAny]
    result_hint = "pending"

    def get(self, request):
        return self._handle(request)

    def post(self, request):
        return self._handle(request)

    def _handle(self, request):
        payload = _extract_payload(request)
        verify_ipn_hash = bool(getattr(settings, "SSLCOMMERZ_VALIDATE_IPN_HASH", True))
        payment, _, response_status = _process_sslcommerz_callback(
            payload,
            enforce_hash=verify_ipn_hash,
        )

        gateway_status = str(payload.get("status") or payload.get("payment_status") or "").strip().lower()
        payment_result = _resolve_payment_result(
            payment=payment,
            gateway_status=gateway_status,
            result_hint=self.result_hint,
            processing_status_code=response_status,
        )
        return redirect(_resolve_frontend_redirect_url(payment=payment, payment_result=payment_result))


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
