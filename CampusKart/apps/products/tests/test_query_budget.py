from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "products-query-budget-tests-cache",
        }
    }
)
class ProductQueryBudgetTests(APITestCase):
    def setUp(self):
        cache.clear()
        user_model = get_user_model()

        vendor_user = user_model.objects.create_user(
            email="vendor-query-budget@example.com",
            password="StrongPass123!",
            full_name="Vendor Query Budget",
            role="vendor",
            is_verified=True,
        )

        vendor = VendorProfile.objects.create(
            user=vendor_user,
            shop_name="Query Budget Shop",
            status=VendorProfile.Status.APPROVED,
        )

        category = Category.objects.create(
            name="Query Budget Category",
            slug="query-budget-category",
            is_active=True,
        )

        for index in range(30):
            Product.objects.create(
                vendor=vendor,
                category=category,
                name=f"Budget Product {index}",
                slug=f"budget-product-{index}",
                description="Query budget seed product",
                price="99.00",
                stock=50,
                status=Product.Status.APPROVED,
            )

    def test_product_list_stays_within_query_budget(self):
        with CaptureQueriesContext(connection) as query_ctx:
            response = self.client.get("/api/v1/products/?page=1&page_size=24&ordering=-created_at")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(
            len(query_ctx.captured_queries),
            3,
            msg=f"Expected <=3 queries but saw {len(query_ctx.captured_queries)}",
        )
