import csv
import io
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, VendorOrder
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Product
from apps.vendors.models import VendorProfile


class VendorAnalyticsExportApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.vendor_user = user_model.objects.create_user(
            email="vendor-export@example.com",
            password="StrongPass123!",
            role="vendor",
            full_name="Vendor Export",
            is_verified=True,
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Vendor Export Shop",
            status=VendorProfile.Status.APPROVED,
            commission_rate=Decimal("10.00"),
        )

        self.other_vendor_user = user_model.objects.create_user(
            email="other-vendor-export@example.com",
            password="StrongPass123!",
            role="vendor",
            full_name="Other Vendor Export",
            is_verified=True,
        )
        self.other_vendor_profile = VendorProfile.objects.create(
            user=self.other_vendor_user,
            shop_name="Other Vendor Export Shop",
            status=VendorProfile.Status.APPROVED,
            commission_rate=Decimal("10.00"),
        )

        self.student_user = user_model.objects.create_user(
            email="student-export@example.com",
            password="StrongPass123!",
            role="student",
            full_name="Student Export",
            is_verified=True,
        )

        self.buyer = user_model.objects.create_user(
            email="buyer-export@example.com",
            password="StrongPass123!",
            role="student",
            full_name="Buyer Export",
            is_verified=True,
        )

        self.product = Product.objects.create(
            vendor=self.vendor_profile,
            name="Export Product",
            slug="export-product",
            description="Product for export coverage",
            price=Decimal("100.00"),
            stock=3,
            status=Product.Status.APPROVED,
        )

        self.other_product = Product.objects.create(
            vendor=self.other_vendor_profile,
            name="Other Export Product",
            slug="other-export-product",
            description="Other product for export isolation",
            price=Decimal("200.00"),
            stock=2,
            status=Product.Status.APPROVED,
        )

        self._create_vendor_payout(
            vendor=self.vendor_profile,
            product=self.product,
            gross=Decimal("100.00"),
            commission=Decimal("10.00"),
            net=Decimal("90.00"),
            payout_status=VendorPayout.Status.PENDING,
        )

        self._create_vendor_payout(
            vendor=self.other_vendor_profile,
            product=self.other_product,
            gross=Decimal("200.00"),
            commission=Decimal("20.00"),
            net=Decimal("180.00"),
            payout_status=VendorPayout.Status.PENDING,
        )

        self.export_url = "/api/v1/vendor/analytics/payouts/export/"

    def _create_vendor_payout(self, *, vendor, product, gross, commission, net, payout_status):
        order = Order.objects.create(
            buyer=self.buyer,
            status=Order.Status.DELIVERED,
            payment_method=Order.PaymentMethod.COD,
            total_amount=gross,
            delivery_address="Dormitory",
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=vendor,
            status=Order.Status.DELIVERED,
            subtotal_amount=gross,
            commission_rate=Decimal("10.00"),
            commission_amount=commission,
            net_vendor_amount=net,
        )

        payment = Payment.objects.create(
            order=order,
            user=self.buyer,
            gateway=Payment.Gateway.COD,
            amount=gross,
            status=Payment.Status.SUCCESS,
        )

        VendorPayout.objects.create(
            payment=payment,
            vendor_order=vendor_order,
            vendor=vendor,
            gross_amount=gross,
            commission_amount=commission,
            net_amount=net,
            status=payout_status,
        )

    @staticmethod
    def _csv_rows(response):
        content = response.content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))
        return list(reader)

    def test_vendor_can_export_own_payout_rows_as_csv(self):
        self.client.force_authenticate(user=self.vendor_user)

        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("attachment; filename=", response["Content-Disposition"])

        rows = self._csv_rows(response)
        self.assertEqual(len(rows), 1)

        row = rows[0]
        self.assertEqual(row["gross"], "100.00")
        self.assertEqual(row["commission"], "10.00")
        self.assertEqual(row["commission_percentage"], "10.00")
        self.assertEqual(row["net"], "90.00")
        self.assertEqual(row["status"], VendorPayout.Status.PENDING)

    def test_student_cannot_export_vendor_payout_csv(self):
        self.client.force_authenticate(user=self.student_user)

        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
