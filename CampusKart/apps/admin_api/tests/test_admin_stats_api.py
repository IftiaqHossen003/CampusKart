from decimal import Decimal
from datetime import timedelta

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
            "LOCATION": "admin-api-tests-cache",
        }
    }
)
class AdminStatsApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="admin-stats@example.com",
            password="StrongPass123!",
            full_name="Admin Stats",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-stats@example.com",
            password="StrongPass123!",
            full_name="Vendor Stats",
            role="vendor",
            is_verified=True,
        )
        self.buyer = user_model.objects.create_user(
            email="buyer-stats@example.com",
            password="StrongPass123!",
            full_name="Buyer Stats",
            role="student",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Stats Vendor",
            status=VendorProfile.Status.APPROVED,
            total_earnings=Decimal("90.00"),
        )
        self.category = Category.objects.create(
            name="Stats Category",
            slug="stats-category",
            is_active=True,
        )
        self.product_approved = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Stats Product Approved",
            slug="stats-product-approved",
            description="Approved product",
            price=Decimal("100.00"),
            stock=10,
            status=Product.Status.APPROVED,
            total_sold=5,
        )
        self.product_rejected = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Stats Product Rejected",
            slug="stats-product-rejected",
            description="Rejected product",
            price=Decimal("50.00"),
            stock=2,
            status=Product.Status.REJECTED,
            total_sold=0,
        )

        self.stats_url = "/api/v1/admin/stats/"
        self.revenue_timeseries_url = "/api/v1/admin/stats/revenue-timeseries/"

    def _auth_admin(self):
        self.client.force_authenticate(user=self.admin_user)

    def _auth_vendor(self):
        self.client.force_authenticate(user=self.vendor_user)

    def _create_paid_chain(self, *, total_amount: Decimal, payout_status: str = VendorPayout.Status.PAID):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm Paid",
            payment_method=Order.PaymentMethod.SSLCOMMERZ,
            total_amount=total_amount,
            status=Order.Status.DELIVERED,
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor,
            status=Order.Status.DELIVERED,
            subtotal_amount=total_amount,
            commission_rate=Decimal("10.00"),
            commission_amount=(total_amount * Decimal("0.10")),
            net_vendor_amount=(total_amount * Decimal("0.90")),
        )
        payment = Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.SSLCOMMERZ,
            amount=total_amount,
            currency="BDT",
            status=Payment.Status.SUCCESS,
        )
        payout = VendorPayout.objects.create(
            payment=payment,
            vendor_order=vendor_order,
            vendor=self.vendor,
            gross_amount=total_amount,
            commission_amount=(total_amount * Decimal("0.10")),
            net_amount=(total_amount * Decimal("0.90")),
            status=payout_status,
        )
        return order, payment, payout

    def _seed_orders_payments(self):
        order_paid = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm A",
            payment_method=Order.PaymentMethod.SSLCOMMERZ,
            total_amount=Decimal("100.00"),
            status=Order.Status.DELIVERED,
        )
        vendor_order_paid = VendorOrder.objects.create(
            order=order_paid,
            vendor=self.vendor,
            status=Order.Status.DELIVERED,
            subtotal_amount=Decimal("100.00"),
            commission_rate=Decimal("10.00"),
            commission_amount=Decimal("10.00"),
            net_vendor_amount=Decimal("90.00"),
        )
        payment_paid = Payment.objects.create(
            order=order_paid,
            user=self.buyer,
            gateway=Payment.Gateway.SSLCOMMERZ,
            amount=Decimal("100.00"),
            currency="BDT",
            status=Payment.Status.SUCCESS,
        )
        VendorPayout.objects.create(
            payment=payment_paid,
            vendor_order=vendor_order_paid,
            vendor=self.vendor,
            gross_amount=Decimal("100.00"),
            commission_amount=Decimal("10.00"),
            net_amount=Decimal("90.00"),
            status=VendorPayout.Status.PAID,
        )

        order_pending = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm B",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("50.00"),
            status=Order.Status.PENDING,
        )
        Payment.objects.create(
            order=order_pending,
            user=self.buyer,
            gateway=Payment.Gateway.COD,
            amount=Decimal("50.00"),
            currency="BDT",
            status=Payment.Status.PENDING,
        )

    def test_stats_endpoint_requires_admin(self):
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth_vendor()
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_stats_endpoint_returns_expected_aggregates(self):
        self._seed_orders_payments()

        self._auth_admin()
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data["total_users"], 3)
        self.assertEqual(data["total_orders"], 2)
        self.assertEqual(data["delivered_orders"], 1)
        self.assertEqual(data["pending_orders"], 1)
        self.assertEqual(Decimal(str(data["gross_order_value"])), Decimal("150.00"))

        self.assertEqual(data["total_payments"], 2)
        self.assertEqual(data["successful_payments"], 1)
        self.assertEqual(data["pending_payments"], 1)
        self.assertEqual(Decimal(str(data["collected_revenue"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(data["pending_cod_collection"])), Decimal("50.00"))

        self.assertEqual(data["total_vendors"], 1)
        self.assertEqual(data["approved_vendors"], 1)
        self.assertEqual(data["total_products"], 2)
        self.assertEqual(data["approved_products"], 1)
        self.assertEqual(data["rejected_products"], 1)

        self.assertEqual(data["total_payouts"], 1)
        self.assertEqual(data["paid_payouts"], 1)
        self.assertEqual(Decimal(str(data["total_paid_out"])), Decimal("90.00"))

    def test_revenue_timeseries_requires_admin(self):
        response = self.client.get(self.revenue_timeseries_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self._auth_vendor()
        response = self.client.get(self.revenue_timeseries_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_revenue_timeseries_returns_requested_day_count(self):
        self._seed_orders_payments()
        self._auth_admin()

        response = self.client.get(f"{self.revenue_timeseries_url}?days=7")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        points = response.data
        self.assertEqual(len(points), 7)
        self.assertTrue(all("date" in point for point in points))
        self.assertTrue(all("collected_revenue" in point for point in points))

    def test_stats_cache_invalidation_on_order_change(self):
        self._auth_admin()

        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        generated_at_first = first.data["generated_at"]

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        generated_at_second = second.data["generated_at"]

        self.assertEqual(generated_at_first, generated_at_second)

        Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm C",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("20.00"),
            status=Order.Status.PENDING,
        )

        third = self.client.get(self.stats_url)
        self.assertEqual(third.status_code, status.HTTP_200_OK)
        generated_at_third = third.data["generated_at"]

        self.assertNotEqual(generated_at_first, generated_at_third)

    def test_stats_cache_invalidation_on_payment_change(self):
        self._auth_admin()

        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        first_total_payments = first.data["total_payments"]

        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm D",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("75.00"),
            status=Order.Status.CONFIRMED,
        )
        Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.COD,
            amount=Decimal("75.00"),
            currency="BDT",
            status=Payment.Status.PENDING,
        )

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["total_payments"], first_total_payments + 1)

    def test_stats_cache_invalidation_on_payout_change(self):
        self._create_paid_chain(total_amount=Decimal("120.00"), payout_status=VendorPayout.Status.READY)
        self._auth_admin()

        first = self.client.get(self.stats_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        first_ready = first.data["ready_payouts"]
        first_paid = first.data["paid_payouts"]

        payout = VendorPayout.objects.filter(status=VendorPayout.Status.READY).first()
        self.assertIsNotNone(payout)
        payout.status = VendorPayout.Status.PAID
        payout.paid_at = timezone.now()
        payout.save(update_fields=["status", "paid_at", "updated_at"])

        second = self.client.get(self.stats_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["ready_payouts"], max(0, first_ready - 1))
        self.assertEqual(second.data["paid_payouts"], first_paid + 1)

    def test_stats_date_range_filtering(self):
        old_order, old_payment, old_payout = self._create_paid_chain(total_amount=Decimal("30.00"))
        self._create_paid_chain(total_amount=Decimal("70.00"))

        old_timestamp = timezone.now() - timedelta(days=10)
        Order.objects.filter(pk=old_order.pk).update(created_at=old_timestamp)
        Payment.objects.filter(pk=old_payment.pk).update(created_at=old_timestamp)
        VendorPayout.objects.filter(pk=old_payout.pk).update(created_at=old_timestamp)

        self._auth_admin()
        today = timezone.now().date().isoformat()
        response = self.client.get(f"{self.stats_url}?from_date={today}&to_date={today}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data["total_orders"], 1)
        self.assertEqual(response.data["total_payments"], 1)
        self.assertEqual(response.data["total_payouts"], 1)
        self.assertEqual(Decimal(str(response.data["collected_revenue"])), Decimal("70.00"))

    def test_stats_date_range_validation(self):
        self._auth_admin()

        response = self.client.get(f"{self.stats_url}?from_date=2026-04-20&to_date=2026-04-01")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("to_date", response.data)
