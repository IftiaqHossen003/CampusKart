from typing import Any, cast

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
            "LOCATION": "admin-product-queue-tests-cache",
        }
    }
)
class AdminProductQueueApiTests(APITestCase):
    def setUp(self):
        user_model = cast(Any, get_user_model())
        self.api_client = cast(Any, self.client)

        self.admin_user = user_model.objects.create_user(
            email="admin-product-queue@example.com",
            password="StrongPass123!",
            full_name="Admin Product Queue",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-product-queue@example.com",
            password="StrongPass123!",
            full_name="Vendor Product Queue",
            role="vendor",
            is_verified=True,
        )
        self.vendor_user_two = user_model.objects.create_user(
            email="vendor-product-queue-two@example.com",
            password="StrongPass123!",
            full_name="Vendor Product Queue Two",
            role="vendor",
            is_verified=True,
        )

        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Alpha Shop",
            status=VendorProfile.Status.PENDING,
        )
        self.vendor_profile_two = VendorProfile.objects.create(
            user=self.vendor_user_two,
            shop_name="Beta Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category_books = Category.objects.create(
            name="Books",
            slug="books",
            is_active=True,
        )
        self.category_lab = Category.objects.create(
            name="Lab Tools",
            slug="lab-tools",
            is_active=True,
        )

        self.pending_product = Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category_books,
            name="Graph Notebook",
            slug="graph-notebook",
            description="Premium graph notebook",
            price="120.00",
            stock=10,
            status=Product.Status.PENDING,
        )
        self.approved_product = Product.objects.create(
            vendor=self.vendor_profile_two,
            category=self.category_lab,
            name="Physics Lab Kit",
            slug="physics-lab-kit",
            description="Lab kit for first year",
            price="560.00",
            stock=5,
            status=Product.Status.APPROVED,
        )
        self.rejected_product = Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category_lab,
            name="Chemistry Bottle",
            slug="chemistry-bottle",
            description="Broken listing sample",
            price="80.00",
            stock=8,
            status=Product.Status.REJECTED,
        )

        self.products_url = "/api/v1/admin/products/"

    def test_non_admin_cannot_access_product_queue(self):
        response = self.api_client.get(self.products_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.api_client.force_authenticate(user=self.vendor_user)
        response = self.api_client.get(self.products_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_filter_search_and_order_product_queue(self):
        self.api_client.force_authenticate(user=self.admin_user)

        pending_response = self.api_client.get(f"{self.products_url}?status=pending")
        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        pending_results = cast(Any, pending_response).data.get("results", [])
        self.assertEqual(len(pending_results), 1)
        self.assertEqual(pending_results[0]["slug"], self.pending_product.slug)

        vendor_search_response = self.api_client.get(f"{self.products_url}?search=Alpha")
        self.assertEqual(vendor_search_response.status_code, status.HTTP_200_OK)
        vendor_search_slugs = {row["slug"] for row in cast(Any, vendor_search_response).data.get("results", [])}
        self.assertIn(self.pending_product.slug, vendor_search_slugs)
        self.assertIn(self.rejected_product.slug, vendor_search_slugs)

        category_search_response = self.api_client.get(f"{self.products_url}?search=Lab")
        self.assertEqual(category_search_response.status_code, status.HTTP_200_OK)
        category_search_slugs = {row["slug"] for row in cast(Any, category_search_response).data.get("results", [])}
        self.assertIn(self.approved_product.slug, category_search_slugs)
        self.assertIn(self.rejected_product.slug, category_search_slugs)

        ordered_response = self.api_client.get(f"{self.products_url}?ordering=name")
        self.assertEqual(ordered_response.status_code, status.HTTP_200_OK)
        ordered_names = [row["name"] for row in cast(Any, ordered_response).data.get("results", [])]
        self.assertEqual(ordered_names, sorted(ordered_names))
