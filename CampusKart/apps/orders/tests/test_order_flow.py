from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cart.models import Cart, CartItem
from apps.notifications.models import Notification
from apps.orders.models import Order, OrderItem
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "orders-tests-cache",
        }
    }
)
class OrderFlowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer@example.com",
            password="StrongPass123!",
            full_name="Buyer",
            role="student",
            is_verified=True,
        )
        self.admin = user_model.objects.create_user(
            email="admin@example.com",
            password="StrongPass123!",
            full_name="Admin",
            role="admin",
            is_verified=True,
        )

        self.vendor_user_1 = user_model.objects.create_user(
            email="vendor1@example.com",
            password="StrongPass123!",
            full_name="Vendor One",
            role="vendor",
            is_verified=True,
        )
        self.vendor_1 = VendorProfile.objects.create(
            user=self.vendor_user_1,
            shop_name="Vendor One Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.vendor_user_2 = user_model.objects.create_user(
            email="vendor2@example.com",
            password="StrongPass123!",
            full_name="Vendor Two",
            role="vendor",
            is_verified=True,
        )
        self.vendor_2 = VendorProfile.objects.create(
            user=self.vendor_user_2,
            shop_name="Vendor Two Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(
            name="Orders Category",
            slug="orders-category",
            is_active=True,
        )

        self.product_1 = Product.objects.create(
            vendor=self.vendor_1,
            category=self.category,
            name="Product One",
            slug="product-one",
            description="Product One",
            price="100.00",
            discount_price="80.00",
            stock=10,
            status=Product.Status.APPROVED,
        )
        self.product_2 = Product.objects.create(
            vendor=self.vendor_2,
            category=self.category,
            name="Product Two",
            slug="product-two",
            description="Product Two",
            price="50.00",
            stock=10,
            status=Product.Status.APPROVED,
        )

        self.orders_url = "/api/v1/orders/"

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _create_order_with_item(self, product):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm 101",
            notes="",
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=product.effective_price,
        )
        order.total_amount = product.effective_price
        order.save(update_fields=["total_amount", "updated_at"])
        return order

    def test_checkout_creates_order_items_updates_stock_clears_cart_and_notifies(self):
        cart = Cart.objects.create(user=self.buyer)
        CartItem.objects.create(cart=cart, product=self.product_1, quantity=2)

        self._auth(self.buyer)
        response = self.client.post(
            self.orders_url,
            {"delivery_address": "Dorm 201", "notes": "Call me"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(buyer=self.buyer)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(Decimal(str(order.total_amount)), Decimal("160.00"))

        item = order.items.get()
        self.assertEqual(item.quantity, 2)
        self.assertEqual(Decimal(str(item.unit_price)), Decimal("80.00"))

        self.product_1.refresh_from_db()
        self.assertEqual(self.product_1.stock, 8)
        self.assertEqual(self.product_1.total_sold, 2)

        cart.refresh_from_db()
        self.assertEqual(cart.items.count(), 0)

        notification = Notification.objects.get(recipient=self.buyer)
        self.assertEqual(notification.notification_type, Notification.Type.ORDER)
        self.assertEqual(notification.data.get("event"), "order_placed")
        self.assertEqual(notification.data.get("order_id"), order.id)

    def test_checkout_rejects_empty_cart(self):
        self._auth(self.buyer)

        response = self.client.post(
            self.orders_url,
            {"delivery_address": "Dorm 201"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("empty", str(response.data).lower())

    def test_vendor_can_update_status_for_owned_order(self):
        order = self._create_order_with_item(self.product_1)

        self._auth(self.vendor_user_1)
        response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CONFIRMED)

    def test_vendor_cannot_update_mixed_vendor_order_but_admin_can(self):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm 101",
            notes="",
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_1,
            quantity=1,
            unit_price=self.product_1.effective_price,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_2,
            quantity=1,
            unit_price=self.product_2.effective_price,
        )

        self._auth(self.vendor_user_1)
        vendor_response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )
        self.assertEqual(vendor_response.status_code, status.HTTP_403_FORBIDDEN)

        self._auth(self.admin)
        admin_response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)

    def test_status_transition_rejects_invalid_jump(self):
        order = self._create_order_with_item(self.product_1)

        self._auth(self.vendor_user_1)
        response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.DELIVERED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid status transition", str(response.data).lower())
