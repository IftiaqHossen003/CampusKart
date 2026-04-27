from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile
from apps.wishlist.models import WishlistItem


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "wishlist-tests-cache",
        }
    }
)
class WishlistApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.student = user_model.objects.create_user(
            email="wishlist-student@example.com",
            password="StrongPass123!",
            full_name="Wishlist Student",
            role="student",
            is_verified=True,
        )
        self.other_student = user_model.objects.create_user(
            email="wishlist-other@example.com",
            password="StrongPass123!",
            full_name="Wishlist Other",
            role="student",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="wishlist-vendor@example.com",
            password="StrongPass123!",
            full_name="Wishlist Vendor",
            role="vendor",
            is_verified=True,
        )
        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Wishlist Shop",
            status=VendorProfile.Status.APPROVED,
        )
        self.category = Category.objects.create(name="Wishlist", slug="wishlist")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Wishlist Product",
            slug="wishlist-product",
            description="wishlist",
            price="50.00",
            stock=10,
            status=Product.Status.APPROVED,
        )

        self.url = "/api/v1/wishlist/"

    def test_post_toggles_wishlist_add_and_remove(self):
        self.client.force_authenticate(user=self.student)

        add_response = self.client.post(self.url, {"product_id": self.product.id}, format="json")
        self.assertEqual(add_response.status_code, status.HTTP_200_OK)
        self.assertEqual(add_response.data["action"], "added")
        self.assertTrue(add_response.data["is_wishlisted"])
        self.assertEqual(WishlistItem.objects.filter(user=self.student, product=self.product).count(), 1)

        remove_response = self.client.post(self.url, {"product_id": self.product.id}, format="json")
        self.assertEqual(remove_response.status_code, status.HTTP_200_OK)
        self.assertEqual(remove_response.data["action"], "removed")
        self.assertFalse(remove_response.data["is_wishlisted"])
        self.assertEqual(WishlistItem.objects.filter(user=self.student, product=self.product).count(), 0)

    def test_get_lists_only_authenticated_users_wishlist(self):
        WishlistItem.objects.create(user=self.student, product=self.product)
        WishlistItem.objects.create(user=self.other_student, product=self.product)

        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["product"]["id"], self.product.id)
