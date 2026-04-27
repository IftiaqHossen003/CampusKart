from unittest.mock import patch

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
            "LOCATION": "products-cache-resilience-tests",
        }
    }
)
class ProductCacheResilienceApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.vendor_user = user_model.objects.create_user(
            email="vendor-resilience@example.com",
            password="StrongPass123!",
            full_name="Vendor Resilience",
            role="vendor",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Resilience Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(
            name="Resilience Category",
            slug="resilience-category",
            is_active=True,
        )

        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Resilience Product",
            slug="resilience-product",
            description="Used to verify cache failure fallback behavior.",
            price="150.00",
            stock=7,
            status=Product.Status.APPROVED,
        )

    def test_product_list_survives_cache_backend_failure(self):
        with patch("apps.products.views.cache.get", side_effect=RuntimeError("cache get failed")), patch(
            "apps.products.views.cache.set", side_effect=RuntimeError("cache set failed")
        ):
            response = self.client.get("/api/v1/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertTrue(any(item.get("slug") == self.product.slug for item in results))

    def test_product_retrieve_survives_cache_backend_failure(self):
        with patch("apps.products.views.cache.get", side_effect=RuntimeError("cache get failed")), patch(
            "apps.products.views.cache.set", side_effect=RuntimeError("cache set failed")
        ):
            response = self.client.get(f"/api/v1/products/{self.product.slug}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("slug"), self.product.slug)
