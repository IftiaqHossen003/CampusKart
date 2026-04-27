from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-vendor-moderation-tests-cache",
        }
    }
)
class VendorModerationApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="admin-vendor-mod@example.com",
            password="StrongPass123!",
            full_name="Admin Vendor Mod",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-vendor-mod@example.com",
            password="StrongPass123!",
            full_name="Vendor Vendor Mod",
            role="vendor",
            is_verified=True,
        )

        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Vendor Moderation Shop",
            status=VendorProfile.Status.PENDING,
        )

        self.category = Category.objects.create(
            name="Vendor Moderation Category",
            slug="vendor-moderation-category",
            is_active=True,
        )
        Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category,
            name="Vendor Moderation Product",
            slug="vendor-moderation-product",
            description="seed product",
            price="100.00",
            stock=5,
            status=Product.Status.PENDING,
        )

    def test_non_admin_cannot_moderate_vendor(self):
        self.client.force_authenticate(user=self.vendor_user)

        response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "should fail"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_approve_and_suspend_vendor(self):
        self.client.force_authenticate(user=self.admin_user)

        approve_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "KYC passed"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.vendor_profile.refresh_from_db()
        self.assertEqual(self.vendor_profile.status, VendorProfile.Status.APPROVED)
        self.assertEqual(self.vendor_profile.approved_by_id, self.admin_user.id)
        self.assertIsNotNone(self.vendor_profile.approved_at)

        suspend_response = self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/suspend/",
            {"reason": "compliance hold"},
            format="json",
        )
        self.assertEqual(suspend_response.status_code, status.HTTP_200_OK)

        self.vendor_profile.refresh_from_db()
        self.assertEqual(self.vendor_profile.status, VendorProfile.Status.SUSPENDED)
