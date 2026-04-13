from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_api.models import AdminAuditLog
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-moderation-tests-cache",
        }
    }
)
class AdminModerationApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="admin-moderation@example.com",
            password="StrongPass123!",
            full_name="Admin Moderation",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-moderation@example.com",
            password="StrongPass123!",
            full_name="Vendor Moderation",
            role="vendor",
            is_verified=True,
        )

        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Moderation Shop",
            status=VendorProfile.Status.PENDING,
        )

        self.category = Category.objects.create(
            name="Moderation Category",
            slug="moderation-category",
            is_active=True,
        )
        self.product = Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category,
            name="Moderation Product",
            slug="moderation-product",
            description="Moderation product",
            price="120.00",
            stock=5,
            status=Product.Status.PENDING,
        )

    def _auth_admin(self):
        self.client.force_authenticate(user=self.admin_user)

    def _auth_vendor(self):
        self.client.force_authenticate(user=self.vendor_user)

    def test_non_admin_cannot_access_admin_moderation_endpoints(self):
        self._auth_vendor()

        vendor_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "should fail"},
            format="json",
        )
        self.assertEqual(vendor_response.status_code, status.HTTP_403_FORBIDDEN)

        product_response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/approve/",
            {"reason": "should fail"},
            format="json",
        )
        self.assertEqual(product_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_approve_and_suspend_vendor(self):
        self._auth_admin()

        approve_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "KYC verified"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.vendor_profile.refresh_from_db()
        self.assertEqual(self.vendor_profile.status, VendorProfile.Status.APPROVED)
        self.assertEqual(self.vendor_profile.approved_by_id, self.admin_user.id)
        self.assertIsNotNone(self.vendor_profile.approved_at)

        suspend_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/suspend/",
            {"reason": "Policy violation"},
            format="json",
        )
        self.assertEqual(suspend_response.status_code, status.HTTP_200_OK)

        self.vendor_profile.refresh_from_db()
        self.assertEqual(self.vendor_profile.status, VendorProfile.Status.SUSPENDED)

    def test_admin_can_approve_and_reject_product(self):
        self._auth_admin()

        approve_response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/approve/",
            {"reason": "Catalog fit"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.APPROVED)
        self.assertEqual(self.product.approved_by_id, self.admin_user.id)
        self.assertIsNotNone(self.product.approved_at)

        reject_response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/reject/",
            {"reason": "Incorrect details"},
            format="json",
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.REJECTED)

    def test_audit_logs_list_and_filter(self):
        self._auth_admin()
        self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "KYC verified"},
            format="json",
        )

        response = self.client.get("/api/v1/admin/audit-logs/?action=vendor_approved")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results", response.data)
        self.assertGreaterEqual(len(results), 1)

        self.assertTrue(
            AdminAuditLog.objects.filter(action="vendor_approved", resource_type="vendor_profile").exists()
        )
