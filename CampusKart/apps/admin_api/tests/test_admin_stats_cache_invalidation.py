from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, VendorOrder
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-stats-cache-invalidation-tests-cache",
        }
    }
)
class AdminStatsCacheInvalidationTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="admin-stats-cache@example.com",
            password="StrongPass123!",
            full_name="Admin Stats Cache",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-stats-cache@example.com",
            password="StrongPass123!",
            full_name="Vendor Stats Cache",
            role="vendor",
            is_verified=True,
        )
        self.buyer = user_model.objects.create_user(
            email="buyer-stats-cache@example.com",
            password="StrongPass123!",
            full_name="Buyer Stats Cache",
            role="student",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Stats Cache Vendor",
            status=VendorProfile.Status.APPROVED,
            total_earnings=Decimal("0.00"),
        )
        self.category = Category.objects.create(
            name="Stats Cache Category",
            slug="stats-cache-category",
            is_active=True,
        )
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Stats Cache Product",
            slug="stats-cache-product",
            description="seed product",
            price=Decimal("200.00"),
            stock=10,
            status=Product.Status.APPROVED,
        )

        self.stats_url = "/api/v1/admin/stats/"
        self.client.force_authenticate(user=self.admin_user)

    def _create_paid_chain(self, *, amount: Decimal, payout_status: str = VendorPayout.Status.READY):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm X",
            payment_method=Order.PaymentMethod.SSLCOMMERZ,
            total_amount=amount,
            status=Order.Status.DELIVERED,
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor,
            status=Order.Status.DELIVERED,
            subtotal_amount=amount,
            commission_rate=Decimal("10.00"),
            commission_amount=amount * Decimal("0.10"),
            net_vendor_amount=amount * Decimal("0.90"),
        )
        payment = Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.SSLCOMMERZ,
            amount=amount,
            currency="BDT",
            status=Payment.Status.SUCCESS,
        )
        payout = VendorPayout.objects.create(
            payment=payment,
            vendor_order=vendor_order,
            vendor=self.vendor,
            gross_amount=amount,
            commission_amount=amount * Decimal("0.10"),
            net_amount=amount * Decimal("0.90"),
            status=payout_status,
        )
        return order, payment, payout

    def test_order_change_invalidates_stats_cache(self):
        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        first_timestamp = first.data["generated_at"]

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["generated_at"], first_timestamp)

        Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm Y",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("40.00"),
            status=Order.Status.PENDING,
        )

        third = self.client.get(self.stats_url)
        self.assertEqual(third.status_code, status.HTTP_200_OK)
        self.assertNotEqual(third.data["generated_at"], first_timestamp)

    def test_payment_change_invalidates_stats_cache(self):
        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        total_before = first.data["total_payments"]

        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm Z",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("55.00"),
            status=Order.Status.CONFIRMED,
        )
        Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.COD,
            amount=Decimal("55.00"),
            currency="BDT",
            status=Payment.Status.PENDING,
        )

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["total_payments"], total_before + 1)

    def test_payout_change_invalidates_stats_cache(self):
        _, _, payout = self._create_paid_chain(amount=Decimal("120.00"), payout_status=VendorPayout.Status.READY)

        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        ready_before = first.data["ready_payouts"]
        paid_before = first.data["paid_payouts"]

        payout.status = VendorPayout.Status.PAID
        payout.paid_at = timezone.now()
        payout.save(update_fields=["status", "paid_at", "updated_at"])

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["ready_payouts"], max(0, ready_before - 1))
        self.assertEqual(second.data["paid_payouts"], paid_before + 1)
