import csv
import io
from datetime import timedelta
from decimal import Decimal
from typing import Any, cast

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-exports-recent-orders-tests-cache",
        }
    }
)
class AdminExportsRecentOrdersApiTests(APITestCase):
    def setUp(self):
        user_model = cast(Any, get_user_model())
        self.api_client = cast(Any, self.client)

        self.admin_user = user_model.objects.create_user(
            email="admin-exports@example.com",
            password="StrongPass123!",
            full_name="Admin Exports",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-exports@example.com",
            password="StrongPass123!",
            full_name="Vendor Exports",
            role="vendor",
            is_verified=True,
        )
        self.vendor_user_two = user_model.objects.create_user(
            email="vendor-exports-two@example.com",
            password="StrongPass123!",
            full_name="Vendor Exports Two",
            role="vendor",
            is_verified=True,
        )
        self.buyer = user_model.objects.create_user(
            email="buyer-exports@example.com",
            password="StrongPass123!",
            full_name="Buyer Exports",
            role="student",
            is_verified=True,
        )

        self.pending_vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Pending Export Shop",
            status=VendorProfile.Status.PENDING,
            contact_email="pending-shop@example.com",
            contact_phone="01700000001",
        )
        self.approved_vendor = VendorProfile.objects.create(
            user=self.vendor_user_two,
            shop_name="Approved Export Shop",
            status=VendorProfile.Status.APPROVED,
            contact_email="approved-shop@example.com",
            contact_phone="01700000002",
        )

        self.category_books = Category.objects.create(name="Export Books", slug="export-books", is_active=True)
        self.category_lab = Category.objects.create(name="Export Lab", slug="export-lab", is_active=True)

        self.pending_product = Product.objects.create(
            vendor=self.pending_vendor,
            category=self.category_books,
            name="Graph Export Notebook",
            slug="graph-export-notebook",
            description="Pending export product",
            price=Decimal("100.00"),
            stock=10,
            status=Product.Status.PENDING,
        )
        self.approved_product = Product.objects.create(
            vendor=self.approved_vendor,
            category=self.category_lab,
            name="Lab Export Kit",
            slug="lab-export-kit",
            description="Approved export product",
            price=Decimal("500.00"),
            stock=3,
            status=Product.Status.APPROVED,
        )

        self.order_old = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Old Address",
            payment_method=Order.PaymentMethod.COD,
            total_amount=Decimal("150.00"),
            status=Order.Status.PENDING,
        )
        self.order_new = Order.objects.create(
            buyer=self.buyer,
            delivery_address="New Address",
            payment_method=Order.PaymentMethod.SSLCOMMERZ,
            total_amount=Decimal("650.00"),
            status=Order.Status.CONFIRMED,
        )

        old_timestamp = timezone.now() - timedelta(days=1)
        Order.objects.filter(pk=self.order_old.pk).update(created_at=old_timestamp)

    @staticmethod
    def _parse_csv_response(response) -> list[dict[str, str]]:
        content = cast(Any, response).content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))
        return list(reader)

    def test_non_admin_cannot_access_recent_orders_and_exports(self):
        recent_url = "/api/v1/admin/orders/recent/"
        vendor_export_url = "/api/v1/admin/vendors/export/"
        product_export_url = "/api/v1/admin/products/export/"

        unauth_recent = self.api_client.get(recent_url)
        self.assertEqual(unauth_recent.status_code, status.HTTP_401_UNAUTHORIZED)

        self.api_client.force_authenticate(user=self.vendor_user)

        vendor_recent = self.api_client.get(recent_url)
        self.assertEqual(vendor_recent.status_code, status.HTTP_403_FORBIDDEN)

        vendor_export = self.api_client.get(vendor_export_url)
        self.assertEqual(vendor_export.status_code, status.HTTP_403_FORBIDDEN)

        product_export = self.api_client.get(product_export_url)
        self.assertEqual(product_export.status_code, status.HTTP_403_FORBIDDEN)

    def test_recent_orders_limit_and_sorting(self):
        self.api_client.force_authenticate(user=self.admin_user)

        response = self.api_client.get("/api/v1/admin/orders/recent/?limit=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = cast(Any, response).data
        self.assertEqual(len(data), 1)
        self.assertEqual(str(data[0]["order_number"]), str(self.order_new.order_number))

    def test_vendor_export_csv_supports_filters(self):
        self.api_client.force_authenticate(user=self.admin_user)

        response = self.api_client.get("/api/v1/admin/vendors/export/?status=pending")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])

        rows = self._parse_csv_response(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["shop_name"], self.pending_vendor.shop_name)
        self.assertEqual(rows[0]["status"], VendorProfile.Status.PENDING)

    def test_product_export_csv_supports_filters(self):
        self.api_client.force_authenticate(user=self.admin_user)

        response = self.api_client.get("/api/v1/admin/products/export/?status=pending&search=Graph")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])

        rows = self._parse_csv_response(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["slug"], self.pending_product.slug)
        self.assertEqual(rows[0]["status"], Product.Status.PENDING)
