from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.products.models import Category, Product, ProductTag
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "products-cache-tests",
        }
    }
)
class ProductTagCacheInvalidationTests(TestCase):
    def setUp(self):
        user_model = get_user_model()

        self.vendor_user = user_model.objects.create_user(
            email="vendor-cache@example.com",
            password="strong-pass-123",
            full_name="Vendor Cache",
            role="vendor",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Cache Test Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(
            name="Cache Category",
            slug="cache-category",
            is_active=True,
        )

        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Cache Product",
            slug="cache-product",
            description="Used for signal and cache invalidation tests.",
            price="100.00",
            stock=10,
            status=Product.Status.APPROVED,
        )

    def test_products_tags_cache_invalidated_on_product_tag_create(self):
        cache.set("products:tags", [{"tag": "old", "count": 1}], 300)

        ProductTag.objects.create(product=self.product, tag="new-tag")

        self.assertIsNone(cache.get("products:tags"))

    def test_products_tags_cache_invalidated_on_product_tag_delete(self):
        tag = ProductTag.objects.create(product=self.product, tag="delete-me")
        cache.set("products:tags", [{"tag": "old", "count": 1}], 300)

        tag.delete()

        self.assertIsNone(cache.get("products:tags"))
