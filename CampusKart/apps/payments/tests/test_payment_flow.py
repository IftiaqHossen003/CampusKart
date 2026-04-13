import hashlib
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import DomainEvent, Order, OrderItem, VendorOrder
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "payments-tests-cache",
        }
    },
    SSLCOMMERZ_STORE_PASSWORD="test-store-password",
    SSLCOMMERZ_VALIDATE_SIGNATURE=True,
)
class PaymentFlowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer-payments@example.com",
            password="StrongPass123!",
            full_name="Buyer Payments",
            role="student",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-payments@example.com",
            password="StrongPass123!",
            full_name="Vendor Payments",
            role="vendor",
            is_verified=True,
        )
        self.admin_user = user_model.objects.create_user(
            email="admin-payments@example.com",
            password="StrongPass123!",
            full_name="Admin Payments",
            role="admin",
            is_verified=True,
        )
        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Payments Vendor",
            status=VendorProfile.Status.APPROVED,
        )
        self.category = Category.objects.create(
            name="Payment Tests Category",
            slug="payment-tests-category",
            is_active=True,
        )
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Payment Product",
            slug="payment-product",
            description="Payment Product",
            price="100.00",
            stock=10,
            status=Product.Status.APPROVED,
        )

        self.payments_url = "/api/v1/payments/initiate/"
        self.webhook_url = "/api/v1/payments/webhook/"
        self.payouts_url = "/api/v1/payments/payouts/"

    def _sslcommerz_sign_payload(self, payload: dict) -> str:
        verify_keys = [k.strip() for k in str(payload.get("verify_key") or "").split(",") if k.strip()]
        params = {key: str(payload.get(key) or "").strip() for key in verify_keys}
        params["store_passwd"] = hashlib.md5(
            str(getattr(settings, "SSLCOMMERZ_STORE_PASSWORD", "")).encode("utf-8")
        ).hexdigest()
        sign_base = "&".join(f"{key}={params[key]}" for key in sorted(params))
        return hashlib.md5(sign_base.encode("utf-8")).hexdigest()

    def _signed_callback_payload(
        self,
        payment: Payment,
        *,
        callback_status: str,
        amount: str | None = None,
        currency: str | None = None,
        val_id: str = "val-12345",
        extra: dict | None = None,
    ) -> dict:
        payload = {
            "tran_id": payment.gateway_order_id,
            "status": callback_status,
            "amount": amount or str(payment.amount),
            "currency": currency or payment.currency,
            "val_id": val_id,
        }
        if extra:
            payload.update(extra)

        payload["verify_key"] = "amount,currency,status,tran_id,val_id"
        payload["verify_sign"] = self._sslcommerz_sign_payload(payload)
        return payload

    def _auth(self):
        self.client.force_authenticate(user=self.buyer)

    def _auth_vendor(self):
        self.client.force_authenticate(user=self.vendor_user)

    def _auth_admin(self):
        self.client.force_authenticate(user=self.admin_user)

    def _create_order(self, *, payment_method=Order.PaymentMethod.COD):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm 101",
            payment_method=payment_method,
            total_amount=Decimal("100.00"),
            notes="",
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor,
            subtotal_amount=Decimal("100.00"),
            commission_rate=Decimal(str(self.vendor.commission_rate)),
            commission_amount=Decimal("10.00"),
            net_vendor_amount=Decimal("90.00"),
        )
        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order,
            product=self.product,
            quantity=1,
            unit_price=Decimal("100.00"),
        )
        return order

    def test_cod_initiation_creates_payment_and_confirms_order(self):
        order = self._create_order(payment_method=Order.PaymentMethod.COD)

        self._auth()
        response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.gateway, Payment.Gateway.COD)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.idempotency_key, "cod-init-1")

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CONFIRMED)

        payout = VendorPayout.objects.get(payment=payment)
        self.assertEqual(payout.status, VendorPayout.Status.PENDING)
        self.assertEqual(payout.net_amount, Decimal("90.00"))

    def test_cod_initiation_is_idempotent_with_same_key(self):
        order = self._create_order(payment_method=Order.PaymentMethod.COD)

        self._auth()
        first = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-2",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-2",
            },
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        self.assertEqual(Payment.objects.filter(order=order).count(), 1)

    def test_sslcommerz_initiation_creates_pending_payment(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("transaction_id", response.data)

        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.gateway, Payment.Gateway.SSLCOMMERZ)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertTrue(payment.gateway_order_id)

    def test_sslcommerz_webhook_success_is_idempotent(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        init_response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-2",
            },
            format="json",
        )
        self.assertEqual(init_response.status_code, status.HTTP_201_CREATED)

        payment = Payment.objects.get(order=order)
        payload = self._signed_callback_payload(payment, callback_status="VALID")

        first = self.client.post(self.webhook_url, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCESS)
        self.assertEqual(order.status, Order.Status.CONFIRMED)

        second = self.client.post(self.webhook_url, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCESS)

        payout = VendorPayout.objects.get(payment=payment)
        self.assertEqual(payout.status, VendorPayout.Status.READY)

        payment_event = DomainEvent.objects.filter(
            event_type="PaymentCompletedEvent",
            order=order,
        ).first()
        self.assertIsNotNone(payment_event)

    def test_sslcommerz_webhook_rejects_invalid_signature(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        init_response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-invalid-sign",
            },
            format="json",
        )
        self.assertEqual(init_response.status_code, status.HTTP_201_CREATED)

        payment = Payment.objects.get(order=order)
        payload = self._signed_callback_payload(payment, callback_status="VALID")
        payload["verify_sign"] = "invalid-signature"

        response = self.client.post(self.webhook_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertIsNone(payment.callback_received_at)

    def test_sslcommerz_failure_callback_marks_payment_failed_and_cancels_payouts(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        init_response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-failed-1",
            },
            format="json",
        )
        self.assertEqual(init_response.status_code, status.HTTP_201_CREATED)

        payment = Payment.objects.get(order=order)
        payload = self._signed_callback_payload(
            payment,
            callback_status="FAILED",
            extra={"failedreason": "bank_declined"},
        )

        response = self.client.post(self.webhook_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        order.refresh_from_db()
        payout = VendorPayout.objects.get(payment=payment)
        payout.refresh_from_db()
        vendor_order = order.vendor_orders.get(vendor=self.vendor)
        vendor_order.refresh_from_db()

        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(vendor_order.status, Order.Status.CANCELLED)
        self.assertEqual(payout.status, VendorPayout.Status.CANCELLED)

        failed_event = DomainEvent.objects.filter(
            event_type="PaymentFailedEvent",
            order=order,
        ).first()
        self.assertIsNotNone(failed_event)

    def test_sslcommerz_finalized_payment_ignores_late_conflicting_callback(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        init_response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-terminal-1",
            },
            format="json",
        )
        self.assertEqual(init_response.status_code, status.HTTP_201_CREATED)

        payment = Payment.objects.get(order=order)
        success_payload = self._signed_callback_payload(payment, callback_status="VALID", val_id="val-ok-1")
        success_response = self.client.post(self.webhook_url, success_payload, format="json")
        self.assertEqual(success_response.status_code, status.HTTP_200_OK)

        failed_payload = self._signed_callback_payload(
            payment,
            callback_status="FAILED",
            val_id="val-late-fail",
            extra={"failedreason": "late_gateway_error"},
        )
        late_response = self.client.post(self.webhook_url, failed_payload, format="json")
        self.assertEqual(late_response.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        order.refresh_from_db()
        payout = VendorPayout.objects.get(payment=payment)
        payout.refresh_from_db()

        self.assertEqual(payment.status, Payment.Status.SUCCESS)
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(payout.status, VendorPayout.Status.READY)

    def test_sslcommerz_success_with_amount_mismatch_marks_failed(self):
        order = self._create_order(payment_method=Order.PaymentMethod.SSLCOMMERZ)

        self._auth()
        init_response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.SSLCOMMERZ,
                "idempotency_key": "ssl-init-amount-mismatch",
            },
            format="json",
        )
        self.assertEqual(init_response.status_code, status.HTTP_201_CREATED)

        payment = Payment.objects.get(order=order)
        mismatch_payload = self._signed_callback_payload(
            payment,
            callback_status="VALID",
            amount="999.99",
        )
        response = self.client.post(self.webhook_url, mismatch_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        order.refresh_from_db()
        payout = VendorPayout.objects.get(payment=payment)
        payout.refresh_from_db()

        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(payment.failure_reason, "Callback amount mismatch")
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(payout.status, VendorPayout.Status.CANCELLED)

    def test_cod_delivery_marks_payment_success_and_payout_ready(self):
        order = self._create_order(payment_method=Order.PaymentMethod.COD)

        self._auth()
        response = self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-3",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self._auth_vendor()
        response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.SHIPPED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.DELIVERED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment = Payment.objects.get(order=order)
        payout = VendorPayout.objects.get(payment=payment)

        order.refresh_from_db()
        payment.refresh_from_db()
        payout.refresh_from_db()

        self.assertEqual(order.status, Order.Status.DELIVERED)
        self.assertEqual(payment.status, Payment.Status.SUCCESS)
        self.assertEqual(payout.status, VendorPayout.Status.READY)
        self.assertIsNotNone(payout.release_at)

        payment_event = DomainEvent.objects.filter(
            event_type="PaymentCompletedEvent",
            order=order,
        ).first()
        self.assertIsNotNone(payment_event)

    def test_vendor_can_list_own_payouts(self):
        order = self._create_order(payment_method=Order.PaymentMethod.COD)

        self._auth()
        self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-4",
            },
            format="json",
        )

        self._auth_vendor()
        response = self.client.get(self.payouts_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)

    def test_admin_can_mark_payout_as_paid(self):
        order = self._create_order(payment_method=Order.PaymentMethod.COD)

        self._auth()
        self.client.post(
            self.payments_url,
            {
                "order_id": order.id,
                "gateway": Payment.Gateway.COD,
                "idempotency_key": "cod-init-5",
            },
            format="json",
        )

        payment = Payment.objects.get(order=order)
        payout = VendorPayout.objects.get(payment=payment)

        self._auth_admin()
        response = self.client.patch(
            f"/api/v1/payments/payouts/{payout.id}/mark-paid/",
            {"payout_reference": "bank-transfer-001"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payout.refresh_from_db()
        self.assertEqual(payout.status, VendorPayout.Status.PAID)
        self.assertEqual(payout.payout_reference, "bank-transfer-001")
        self.assertIsNotNone(payout.paid_at)
