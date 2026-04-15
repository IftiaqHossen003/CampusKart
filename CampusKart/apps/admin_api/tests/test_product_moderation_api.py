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
            "LOCATION": "admin-product-moderation-tests-cache",
        }
    }
)
class ProductModerationApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="admin-product-mod@example.com",
            password="StrongPass123!",
            full_name="Admin Product Mod",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-product-mod@example.com",
            password="StrongPass123!",
            full_name="Vendor Product Mod",
            role="vendor",
            is_verified=True,
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Product Moderation Shop",
            status=VendorProfile.Status.PENDING,
        )

        self.category = Category.objects.create(
            name="Product Moderation Category",
            slug="product-moderation-category",
            is_active=True,
        )
        self.product = Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category,
            name="Product Moderation Product",
            slug="product-moderation-product",
            description="product",
            price="150.00",
            stock=3,
            status=Product.Status.PENDING,
        )

    def test_non_admin_cannot_moderate_product(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/approve/",
            {"reason": "should fail"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_approve_and_reject_product(self):
        self.client.force_authenticate(user=self.admin_user)

        approve_response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/approve/",
            {"reason": "passes checks"},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.APPROVED)
        self.assertEqual(self.product.approved_by_id, self.admin_user.id)
        self.assertIsNotNone(self.product.approved_at)

        reject_response = self.client.post(
            f"/api/v1/admin/products/{self.product.slug}/reject/",
            {"reason": "bad metadata"},
            format="json",
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.REJECTED)
