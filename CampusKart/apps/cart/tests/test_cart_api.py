from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cart.models import CartItem
from apps.products.models import Category, Product, ProductImage
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "cart-tests-cache",
        }
    }
)
class CartApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.user = user_model.objects.create_user(
            email="cart-user@example.com",
            password="StrongPass123!",
            full_name="Cart User",
            role="student",
            is_verified=True,
        )
        self.other_user = user_model.objects.create_user(
            email="other-cart-user@example.com",
            password="StrongPass123!",
            full_name="Other User",
            role="student",
            is_verified=True,
        )

        self.vendor_user = user_model.objects.create_user(
            email="vendor-for-cart@example.com",
            password="StrongPass123!",
            full_name="Vendor User",
            role="vendor",
            is_verified=True,
        )
        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Cart Vendor",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(
            name="Cart Category",
            slug="cart-category",
            is_active=True,
        )

        self.product_1 = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Notebook",
            slug="notebook",
            description="A notebook.",
            price="100.00",
            discount_price="80.00",
            stock=10,
            status=Product.Status.APPROVED,
        )
        self.product_2 = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Pen",
            slug="pen",
            description="A pen.",
            price="20.00",
            stock=5,
            status=Product.Status.APPROVED,
        )
        self.unapproved_product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Draft Product",
            slug="draft-product",
            description="Not approved.",
            price="10.00",
            stock=5,
            status=Product.Status.PENDING,
        )

        ProductImage.objects.create(
            product=self.product_1,
            image_url="https://example.com/notebook-primary.jpg",
            is_primary=True,
            sort_order=0,
        )

        self.cart_url = "/api/v1/cart/"
        self.clear_url = "/api/v1/cart/clear/"

    def _auth(self, user=None):
        self.client.force_authenticate(user=user or self.user)

    def _replace_cart(self, items, merge=False):
        payload = {"items": items}
        if merge:
            payload["merge"] = True
        return self.client.post(self.cart_url, payload, format="json")

    def _find_item(self, response_data, product_id):
        return next(item for item in response_data["items"] if item["product"]["id"] == product_id)

    def _assert_cart_payload_shape(self, payload):
        self.assertIn("id", payload)
        self.assertIn("items", payload)
        self.assertIn("total_items", payload)
        self.assertIn("total_quantity", payload)
        self.assertIn("total_amount", payload)

    def test_retrieve_empty_cart_creates_cart(self):
        self._auth()

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"], [])
        self.assertEqual(response.data["total_items"], 0)
        self.assertEqual(response.data["total_quantity"], 0)
        self.assertEqual(Decimal(str(response.data["total_amount"])), Decimal("0.00"))
        self.assertIsNotNone(response.data["id"])

    def test_replace_full_cart(self):
        self._auth()

        response = self._replace_cart(
            [
                {"product": self.product_1.id, "quantity": 2},
                {"product": self.product_2.id, "quantity": 1},
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_items"], 2)
        self.assertEqual(response.data["total_quantity"], 3)
        self.assertEqual(Decimal(str(response.data["total_amount"])), Decimal("180.00"))

        product_payload = self._find_item(response.data, self.product_1.id)["product"]
        self.assertEqual(product_payload["name"], self.product_1.name)
        self.assertEqual(product_payload["slug"], self.product_1.slug)
        self.assertEqual(product_payload["thumbnail"], "https://example.com/notebook-primary.jpg")
        self.assertEqual(Decimal(str(product_payload["price"])), Decimal("80.00"))
        self.assertEqual(product_payload["stock"], 10)

    def test_replace_with_empty_items_clears_cart(self):
        self._auth()
        self._replace_cart([{"product": self.product_1.id, "quantity": 2}])

        response = self._replace_cart([])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"], [])
        self.assertEqual(response.data["total_items"], 0)
        self.assertEqual(response.data["total_quantity"], 0)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_patch_cart_item_quantity(self):
        self._auth()
        replace_response = self._replace_cart([{"product": self.product_1.id, "quantity": 1}])
        item_id = replace_response.data["items"][0]["id"]

        response = self.client.patch(
            f"/api/v1/cart/items/{item_id}/",
            {"quantity": 4},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        patched_item = self._find_item(response.data, self.product_1.id)
        self.assertEqual(patched_item["quantity"], 4)
        self.assertEqual(response.data["total_quantity"], 4)

    def test_delete_cart_item(self):
        self._auth()
        replace_response = self._replace_cart(
            [
                {"product": self.product_1.id, "quantity": 1},
                {"product": self.product_2.id, "quantity": 1},
            ]
        )
        item_to_delete = self._find_item(replace_response.data, self.product_1.id)["id"]

        response = self.client.delete(f"/api/v1/cart/items/{item_to_delete}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_items"], 1)
        remaining_product_ids = {item["product"]["id"] for item in response.data["items"]}
        self.assertNotIn(self.product_1.id, remaining_product_ids)
        self.assertIn(self.product_2.id, remaining_product_ids)

    def test_clear_cart(self):
        self._auth()
        self._replace_cart([{"product": self.product_1.id, "quantity": 2}])

        response = self.client.post(self.clear_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"], [])
        self.assertEqual(response.data["total_items"], 0)
        self.assertEqual(response.data["total_quantity"], 0)

    def test_duplicate_product_ids_are_consolidated_on_replace(self):
        self._auth()

        response = self._replace_cart(
            [
                {"product": self.product_1.id, "quantity": 1},
                {"product": self.product_1.id, "quantity": 2},
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_items"], 1)
        self.assertEqual(response.data["total_quantity"], 3)
        item = self._find_item(response.data, self.product_1.id)
        self.assertEqual(item["quantity"], 3)

    def test_insufficient_stock_returns_400_with_product_name(self):
        self._auth()

        response = self._replace_cart(
            [{"product": self.product_2.id, "quantity": self.product_2.stock + 1}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(self.product_2.name, str(response.data))

    def test_unapproved_product_cannot_be_added(self):
        self._auth()

        response = self._replace_cart(
            [{"product": self.unapproved_product.id, "quantity": 1}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(self.unapproved_product.name, str(response.data))

    def test_user_cannot_access_another_users_cart_item(self):
        self._auth(self.other_user)
        replace_response = self._replace_cart([{"product": self.product_1.id, "quantity": 1}])
        other_user_item_id = replace_response.data["items"][0]["id"]

        self._auth(self.user)
        response = self.client.patch(
            f"/api/v1/cart/items/{other_user_item_id}/",
            {"quantity": 2},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_every_write_returns_full_cart_payload(self):
        self._auth()

        replace_response = self._replace_cart([{"product": self.product_1.id, "quantity": 1}])
        self.assertEqual(replace_response.status_code, status.HTTP_200_OK)
        self._assert_cart_payload_shape(replace_response.data)

        item_id = replace_response.data["items"][0]["id"]
        patch_response = self.client.patch(
            f"/api/v1/cart/items/{item_id}/",
            {"quantity": 2},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self._assert_cart_payload_shape(patch_response.data)

        delete_response = self.client.delete(f"/api/v1/cart/items/{item_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)
        self._assert_cart_payload_shape(delete_response.data)

        clear_response = self.client.post(self.clear_url, {}, format="json")
        self.assertEqual(clear_response.status_code, status.HTTP_200_OK)
        self._assert_cart_payload_shape(clear_response.data)

    def test_merge_mode_adds_to_existing_cart(self):
        self._auth()

        initial_response = self._replace_cart([{"product": self.product_1.id, "quantity": 1}])
        self.assertEqual(initial_response.status_code, status.HTTP_200_OK)

        merge_response = self._replace_cart(
            [
                {"product": self.product_1.id, "quantity": 2},
                {"product": self.product_2.id, "quantity": 1},
            ],
            merge=True,
        )

        self.assertEqual(merge_response.status_code, status.HTTP_200_OK)
        item_1 = self._find_item(merge_response.data, self.product_1.id)
        item_2 = self._find_item(merge_response.data, self.product_2.id)

        self.assertEqual(item_1["quantity"], 3)
        self.assertEqual(item_2["quantity"], 1)
        self.assertEqual(merge_response.data["total_items"], 2)
        self.assertEqual(merge_response.data["total_quantity"], 4)
