from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, OrderItem, VendorOrder
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "orders-query-budget-tests-cache",
        }
    }
)
class OrderQueryBudgetTests(APITestCase):
    def setUp(self):
        cache.clear()
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer-query-budget@example.com",
            password="StrongPass123!",
            full_name="Buyer Query Budget",
            role="student",
            is_verified=True,
        )
        vendor_user = user_model.objects.create_user(
            email="vendor-order-query-budget@example.com",
            password="StrongPass123!",
            full_name="Vendor Query Budget",
            role="vendor",
            is_verified=True,
        )
        vendor = VendorProfile.objects.create(
            user=vendor_user,
            shop_name="Order Query Budget Shop",
            status=VendorProfile.Status.APPROVED,
        )
        category = Category.objects.create(
            name="Order Query Budget Category",
            slug="order-query-budget-category",
            is_active=True,
        )
        product = Product.objects.create(
            vendor=vendor,
            category=category,
            name="Order Query Budget Product",
            slug="order-query-budget-product",
            description="Order query budget seed product",
            price="120.00",
            stock=100,
            status=Product.Status.APPROVED,
        )

        self.order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Hall 4",
            notes="",
            total_amount=Decimal("120.00"),
        )
        vendor_order = VendorOrder.objects.create(
            order=self.order,
            vendor=vendor,
            subtotal_amount=Decimal("120.00"),
            commission_rate=Decimal("10.00"),
            commission_amount=Decimal("12.00"),
            net_vendor_amount=Decimal("108.00"),
        )
        OrderItem.objects.create(
            order=self.order,
            vendor_order=vendor_order,
            product=product,
            quantity=1,
            unit_price=Decimal("120.00"),
        )

    def test_order_detail_stays_within_query_budget(self):
        self.client.force_authenticate(user=self.buyer)
        with CaptureQueriesContext(connection) as query_ctx:
            response = self.client.get(f"/api/v1/orders/{self.order.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(
            len(query_ctx.captured_queries),
            5,
            msg=f"Expected <=5 queries but saw {len(query_ctx.captured_queries)}",
        )
