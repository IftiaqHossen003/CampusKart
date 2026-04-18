from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, OrderItem, VendorOrder
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Product, ProductViewDaily
from apps.vendors.models import VendorProfile


class VendorAnalyticsApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer.analytics@example.com",
            password="StrongPass123!",
            role="student",
            full_name="Buyer Analytics",
            is_verified=True,
        )

        self.vendor_user = user_model.objects.create_user(
            email="vendor.analytics@example.com",
            password="StrongPass123!",
            role="vendor",
            full_name="Vendor One",
            is_verified=True,
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Vendor One Shop",
            status=VendorProfile.Status.APPROVED,
            commission_rate=Decimal("10.00"),
        )

        self.other_vendor_user = user_model.objects.create_user(
            email="vendor.other@example.com",
            password="StrongPass123!",
            role="vendor",
            full_name="Vendor Two",
            is_verified=True,
        )
        self.other_vendor_profile = VendorProfile.objects.create(
            user=self.other_vendor_user,
            shop_name="Vendor Two Shop",
            status=VendorProfile.Status.APPROVED,
            commission_rate=Decimal("10.00"),
        )

        self.student_user = user_model.objects.create_user(
            email="student.analytics@example.com",
            password="StrongPass123!",
            role="student",
            full_name="Student User",
            is_verified=True,
        )

        self.product_one = Product.objects.create(
            vendor=self.vendor_profile,
            name="Product One",
            slug="product-one",
            description="P1",
            price=Decimal("50.00"),
            stock=10,
            status=Product.Status.APPROVED,
            total_sold=2,
            avg_rating=Decimal("4.50"),
        )
        self.product_two = Product.objects.create(
            vendor=self.vendor_profile,
            name="Product Two",
            slug="product-two",
            description="P2",
            price=Decimal("50.00"),
            stock=8,
            status=Product.Status.PENDING,
            total_sold=1,
            avg_rating=Decimal("3.00"),
        )
        self.other_product = Product.objects.create(
            vendor=self.other_vendor_profile,
            name="Other Product",
            slug="other-product",
            description="P3",
            price=Decimal("70.00"),
            stock=6,
            status=Product.Status.APPROVED,
            total_sold=1,
            avg_rating=Decimal("5.00"),
        )

        ProductViewDaily.objects.create(
            product=self.product_one,
            view_date=timezone.localdate(),
            view_count=12,
        )
        ProductViewDaily.objects.create(
            product=self.product_two,
            view_date=timezone.localdate(),
            view_count=3,
        )

        self._create_vendor_order_with_payment_and_payout(
            vendor=self.vendor_profile,
            product=self.product_one,
            quantity=2,
            unit_price=Decimal("50.00"),
            status=Order.Status.DELIVERED,
            net_vendor_amount=Decimal("100.00"),
            payout_status=VendorPayout.Status.PENDING,
            created_at=timezone.now(),
        )

        last_month_datetime = self._last_month_datetime()
        self._create_vendor_order_with_payment_and_payout(
            vendor=self.vendor_profile,
            product=self.product_two,
            quantity=1,
            unit_price=Decimal("50.00"),
            status=Order.Status.DELIVERED,
            net_vendor_amount=Decimal("50.00"),
            payout_status=VendorPayout.Status.PAID,
            created_at=last_month_datetime,
        )

        self._create_vendor_order_with_payment_and_payout(
            vendor=self.vendor_profile,
            product=self.product_two,
            quantity=1,
            unit_price=Decimal("40.00"),
            status=Order.Status.PENDING,
            net_vendor_amount=Decimal("40.00"),
            payout_status=VendorPayout.Status.READY,
            created_at=timezone.now(),
            create_payout=False,
        )

        self._create_vendor_order_with_payment_and_payout(
            vendor=self.other_vendor_profile,
            product=self.other_product,
            quantity=1,
            unit_price=Decimal("70.00"),
            status=Order.Status.DELIVERED,
            net_vendor_amount=Decimal("70.00"),
            payout_status=VendorPayout.Status.PENDING,
            created_at=timezone.now(),
        )

        self.overview_url = "/api/v1/vendor/analytics/overview/"
        self.revenue_url = "/api/v1/vendor/analytics/revenue/"
        self.products_url = "/api/v1/vendor/analytics/products/"
        self.payouts_url = "/api/v1/vendor/analytics/payouts/"

    def _last_month_datetime(self):
        this_month_start = timezone.now().replace(day=1, hour=10, minute=0, second=0, microsecond=0)
        return (this_month_start - timedelta(days=1)).replace(day=15)

    def _create_vendor_order_with_payment_and_payout(
        self,
        *,
        vendor,
        product,
        quantity,
        unit_price,
        status,
        net_vendor_amount,
        payout_status,
        created_at,
        create_payout=True,
    ):
        order = Order.objects.create(
            buyer=self.buyer,
            status=status,
            payment_method=Order.PaymentMethod.COD,
            total_amount=net_vendor_amount,
            delivery_address="Dormitory",
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=vendor,
            status=status,
            subtotal_amount=unit_price * quantity,
            commission_rate=Decimal("10.00"),
            commission_amount=Decimal("0.00"),
            net_vendor_amount=net_vendor_amount,
        )
        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order,
            product=product,
            quantity=quantity,
            unit_price=unit_price,
        )

        VendorOrder.objects.filter(pk=vendor_order.pk).update(created_at=created_at)

        payment = Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.COD,
            amount=net_vendor_amount,
            status=Payment.Status.SUCCESS,
        )

        if not create_payout:
            return

        VendorPayout.objects.create(
            payment=payment,
            vendor_order=vendor_order,
            vendor=vendor,
            gross_amount=net_vendor_amount,
            commission_amount=Decimal("0.00"),
            net_amount=net_vendor_amount,
            status=payout_status,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_overview_returns_vendor_scoped_metrics(self):
        self._auth(self.vendor_user)

        response = self.client.get(self.overview_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(Decimal(data["total_revenue"]), Decimal("150.00"))
        self.assertEqual(Decimal(data["this_month_revenue"]), Decimal("100.00"))
        self.assertEqual(Decimal(data["last_month_revenue"]), Decimal("50.00"))
        self.assertEqual(data["this_month_orders"], 2)
        self.assertEqual(data["last_month_orders"], 1)
        self.assertEqual(Decimal(data["this_month_avg_rating"]), Decimal("0.00"))
        self.assertEqual(Decimal(data["last_month_avg_rating"]), Decimal("0.00"))
        self.assertEqual(Decimal(data["pending_payout_amount"]), Decimal("100.00"))
        self.assertEqual(Decimal(data["this_month_pending_payout"]), Decimal("100.00"))
        self.assertEqual(Decimal(data["last_month_pending_payout"]), Decimal("0.00"))
        self.assertEqual(data["total_orders"], 3)
        self.assertEqual(data["pending_orders"], 1)
        self.assertEqual(data["completed_orders"], 2)
        self.assertEqual(data["total_products"], 2)
        self.assertEqual(data["approved_products"], 1)
        self.assertEqual(data["pending_products"], 1)
        self.assertEqual(data["top_product"]["name"], "Product One")
        self.assertEqual(data["top_product"]["total_sold"], 2)
        self.assertEqual(Decimal(data["top_product"]["revenue"]), Decimal("100.00"))
        self.assertEqual(Decimal(data["avg_rating"]), Decimal("3.75"))

    def test_revenue_endpoint_validates_period(self):
        self._auth(self.vendor_user)

        response = self.client.get(f"{self.revenue_url}?period=15d")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_revenue_endpoint_returns_continuous_series(self):
        self._auth(self.vendor_user)

        response = self.client.get(f"{self.revenue_url}?period=7d")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 7)
        self.assertTrue(all(set(point.keys()) == {"date", "revenue", "orders"} for point in response.data))

        non_zero_rows = [row for row in response.data if Decimal(row["revenue"]) > 0]
        self.assertGreaterEqual(len(non_zero_rows), 1)

    def test_products_endpoint_returns_sorted_product_stats(self):
        self._auth(self.vendor_user)

        response = self.client.get(self.products_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "Product One")
        self.assertEqual(data[0]["views"], 12)
        self.assertEqual(data[0]["sold"], 2)
        self.assertEqual(Decimal(data[0]["revenue"]), Decimal("100.00"))
        self.assertEqual(Decimal(data[0]["rating"]), Decimal("4.50"))

    def test_payouts_endpoint_returns_rows_and_pending_total(self):
        self._auth(self.vendor_user)

        response = self.client.get(self.payouts_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(Decimal(data["total_earned"]), Decimal("150.00"))
        self.assertEqual(Decimal(data["total_commission_paid"]), Decimal("0.00"))
        self.assertEqual(Decimal(data["total_net_received"]), Decimal("50.00"))
        self.assertEqual(Decimal(data["total_pending_amount"]), Decimal("100.00"))
        self.assertEqual(Decimal(data["total_pending_payout_amount"]), Decimal("100.00"))
        self.assertEqual(len(data["payouts"]), 2)
        self.assertTrue(all("order_number" in item for item in data["payouts"]))
        self.assertTrue(all("commission_percentage" in item for item in data["payouts"]))

    def test_student_cannot_access_vendor_analytics(self):
        self._auth(self.student_user)

        response = self.client.get(self.overview_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_vendor_data_is_isolated(self):
        self._auth(self.other_vendor_user)

        response = self.client.get(self.overview_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(Decimal(data["total_revenue"]), Decimal("70.00"))
        self.assertEqual(data["total_orders"], 1)
        self.assertEqual(data["total_products"], 1)

    def test_overview_cache_is_invalidated_on_vendor_order_change(self):
        self._auth(self.vendor_user)

        first = self.client.get(self.overview_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(first.data["total_revenue"]), Decimal("150.00"))

        self._create_vendor_order_with_payment_and_payout(
            vendor=self.vendor_profile,
            product=self.product_one,
            quantity=1,
            unit_price=Decimal("25.00"),
            status=Order.Status.DELIVERED,
            net_vendor_amount=Decimal("25.00"),
            payout_status=VendorPayout.Status.PENDING,
            created_at=timezone.now(),
        )

        second = self.client.get(self.overview_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(second.data["total_revenue"]), Decimal("175.00"))

    def test_payouts_cache_is_invalidated_on_payout_status_change(self):
        self._auth(self.vendor_user)

        first = self.client.get(self.payouts_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(first.data["total_pending_payout_amount"]), Decimal("100.00"))

        pending = VendorPayout.objects.filter(
            vendor=self.vendor_profile,
            status=VendorPayout.Status.PENDING,
        ).first()
        self.assertIsNotNone(pending)

        pending.status = VendorPayout.Status.PAID
        pending.save(update_fields=["status", "updated_at"])

        second = self.client.get(self.payouts_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(second.data["total_pending_payout_amount"]), Decimal("0.00"))

    def test_products_cache_is_invalidated_on_view_counter_change(self):
        self._auth(self.vendor_user)

        first = self.client.get(self.products_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        product_one_row = next(item for item in first.data if item["name"] == "Product One")
        self.assertEqual(product_one_row["views"], 12)

        daily = ProductViewDaily.objects.get(
            product=self.product_one,
            view_date=timezone.localdate(),
        )
        daily.view_count = 20
        daily.save(update_fields=["view_count", "updated_at"])

        second = self.client.get(self.products_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)

        product_one_row_after = next(item for item in second.data if item["name"] == "Product One")
        self.assertEqual(product_one_row_after["views"], 20)
