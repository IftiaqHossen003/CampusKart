from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cart.models import Cart, CartItem
from apps.notifications.models import Notification
from apps.orders.models import DomainEvent, Order, OrderItem, VendorOrder
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
        subtotal = Decimal(str(product.effective_price))
        commission_rate = Decimal(str(product.vendor.commission_rate))
        commission_amount = (subtotal * commission_rate / Decimal("100")).quantize(Decimal("0.01"))
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=product.vendor,
            subtotal_amount=subtotal,
            commission_rate=commission_rate,
            commission_amount=commission_amount,
            net_vendor_amount=(subtotal - commission_amount),
        )
        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order,
            product=product,
            quantity=1,
            unit_price=product.effective_price,
        )
        order.total_amount = product.effective_price
        order.save(update_fields=["total_amount", "updated_at"])
        return order

    @staticmethod
    def _extract_results(payload):
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("results", [])
        return []

    def _create_mixed_vendor_order(self):
        order = Order.objects.create(
            buyer=self.buyer,
            delivery_address="Dorm 301",
            notes="Mixed order",
        )

        subtotal_1 = Decimal(str(self.product_1.effective_price)) * Decimal("2")
        commission_rate_1 = Decimal(str(self.vendor_1.commission_rate))
        commission_amount_1 = (subtotal_1 * commission_rate_1 / Decimal("100")).quantize(Decimal("0.01"))
        vendor_order_1 = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor_1,
            subtotal_amount=subtotal_1,
            commission_rate=commission_rate_1,
            commission_amount=commission_amount_1,
            net_vendor_amount=(subtotal_1 - commission_amount_1),
        )

        subtotal_2 = Decimal(str(self.product_2.effective_price))
        commission_rate_2 = Decimal(str(self.vendor_2.commission_rate))
        commission_amount_2 = (subtotal_2 * commission_rate_2 / Decimal("100")).quantize(Decimal("0.01"))
        vendor_order_2 = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor_2,
            subtotal_amount=subtotal_2,
            commission_rate=commission_rate_2,
            commission_amount=commission_amount_2,
            net_vendor_amount=(subtotal_2 - commission_amount_2),
        )

        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order_1,
            product=self.product_1,
            quantity=2,
            unit_price=self.product_1.effective_price,
        )
        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order_2,
            product=self.product_2,
            quantity=1,
            unit_price=self.product_2.effective_price,
        )
        order.total_amount = (Decimal(str(self.product_1.effective_price)) * Decimal("2")) + Decimal(
            str(self.product_2.effective_price)
        )
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
        self.assertEqual(order.vendor_orders.count(), 1)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(Decimal(str(order.total_amount)), Decimal("160.00"))
        self.assertEqual(order.payment_method, Order.PaymentMethod.COD)

        item = order.items.get()
        self.assertEqual(item.quantity, 2)
        self.assertEqual(Decimal(str(item.unit_price)), Decimal("80.00"))
        self.assertIsNotNone(item.vendor_order)

        self.product_1.refresh_from_db()
        self.assertEqual(self.product_1.stock, 8)
        self.assertEqual(self.product_1.total_sold, 2)

        cart.refresh_from_db()
        self.assertEqual(cart.items.count(), 0)

        notification = Notification.objects.get(recipient=self.buyer)
        self.assertEqual(notification.notification_type, Notification.Type.ORDER)
        self.assertEqual(notification.data.get("event"), "order_placed")
        self.assertEqual(notification.data.get("order_id"), order.id)

        order_created_event = DomainEvent.objects.filter(
            event_type="OrderCreatedEvent",
            order=order,
        ).first()
        self.assertIsNotNone(order_created_event)

        vendor_created_events_count = DomainEvent.objects.filter(
            event_type="VendorOrderCreatedEvent",
            order=order,
        ).count()
        self.assertEqual(vendor_created_events_count, 1)

    def test_checkout_rejects_empty_cart(self):
        self._auth(self.buyer)

        response = self.client.post(
            self.orders_url,
            {"delivery_address": "Dorm 201"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("empty", str(response.data).lower())

    def test_checkout_with_same_request_id_replays_existing_order(self):
        cart = Cart.objects.create(user=self.buyer)
        CartItem.objects.create(cart=cart, product=self.product_1, quantity=2)

        self._auth(self.buyer)
        payload = {
            "delivery_address": "Dorm 201",
            "notes": "Call me",
            "request_id": "checkout-req-001",
        }

        first_response = self.client.post(self.orders_url, payload, format="json")
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

        first_order_id = first_response.data["id"]
        first_order_number = first_response.data["order_number"]

        second_response = self.client.post(self.orders_url, payload, format="json")
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.data["id"], first_order_id)
        self.assertEqual(second_response.data["order_number"], first_order_number)

        self.assertEqual(Order.objects.filter(buyer=self.buyer).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.buyer).count(), 1)
        self.assertEqual(
            DomainEvent.objects.filter(event_type="OrderCreatedEvent").count(),
            1,
        )
        self.assertEqual(
            DomainEvent.objects.filter(event_type="VendorOrderCreatedEvent").count(),
            1,
        )

        self.product_1.refresh_from_db()
        self.assertEqual(self.product_1.stock, 8)

    def test_checkout_rejects_blank_request_id(self):
        cart = Cart.objects.create(user=self.buyer)
        CartItem.objects.create(cart=cart, product=self.product_1, quantity=1)

        self._auth(self.buyer)
        response = self.client.post(
            self.orders_url,
            {
                "delivery_address": "Dorm 201",
                "request_id": "   ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("request_id", str(response.data).lower())

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

    def test_vendor_can_update_mixed_vendor_order_and_admin_can_still_override(self):
        order = self._create_mixed_vendor_order()

        self._auth(self.vendor_user_1)
        vendor_response = self.client.patch(
            f"/api/v1/orders/{order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )
        self.assertEqual(vendor_response.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        vendor_1_order = order.vendor_orders.get(vendor=self.vendor_1)
        vendor_2_order = order.vendor_orders.get(vendor=self.vendor_2)
        self.assertEqual(vendor_1_order.status, Order.Status.CONFIRMED)
        self.assertEqual(vendor_2_order.status, Order.Status.PENDING)

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

    def test_vendor_order_list_only_contains_orders_for_their_shop(self):
        vendor_1_order = self._create_order_with_item(self.product_1)
        self._create_order_with_item(self.product_2)

        self._auth(self.vendor_user_1)
        response = self.client.get("/api/v1/orders/vendor/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._extract_results(response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], vendor_1_order.id)

    def test_mixed_vendor_order_each_vendor_sees_only_their_items(self):
        mixed_order = self._create_mixed_vendor_order()

        self._auth(self.vendor_user_1)
        vendor_1_response = self.client.get("/api/v1/orders/vendor/")
        self.assertEqual(vendor_1_response.status_code, status.HTTP_200_OK)
        vendor_1_results = self._extract_results(vendor_1_response.data)
        self.assertEqual(len(vendor_1_results), 1)
        self.assertEqual(vendor_1_results[0]["id"], mixed_order.id)
        self.assertEqual(len(vendor_1_results[0]["items"]), 1)
        self.assertEqual(vendor_1_results[0]["items"][0]["product"], self.product_1.id)

        self._auth(self.vendor_user_2)
        vendor_2_response = self.client.get("/api/v1/orders/vendor/")
        self.assertEqual(vendor_2_response.status_code, status.HTTP_200_OK)
        vendor_2_results = self._extract_results(vendor_2_response.data)
        self.assertEqual(len(vendor_2_results), 1)
        self.assertEqual(vendor_2_results[0]["id"], mixed_order.id)
        self.assertEqual(len(vendor_2_results[0]["items"]), 1)
        self.assertEqual(vendor_2_results[0]["items"][0]["product"], self.product_2.id)

    def test_parent_status_aggregates_from_vendor_updates(self):
        mixed_order = self._create_mixed_vendor_order()

        self._auth(self.vendor_user_1)
        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.SHIPPED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mixed_order.refresh_from_db()
        self.assertEqual(mixed_order.status, Order.Status.PARTIALLY_SHIPPED)

        self._auth(self.vendor_user_2)
        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.CONFIRMED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.SHIPPED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mixed_order.refresh_from_db()
        self.assertEqual(mixed_order.status, Order.Status.SHIPPED)

        self._auth(self.vendor_user_1)
        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.DELIVERED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mixed_order.refresh_from_db()
        self.assertEqual(mixed_order.status, Order.Status.PARTIALLY_SHIPPED)

        self._auth(self.vendor_user_2)
        response = self.client.patch(
            f"/api/v1/orders/{mixed_order.id}/status/",
            {"status": Order.Status.DELIVERED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mixed_order.refresh_from_db()
        self.assertEqual(mixed_order.status, Order.Status.DELIVERED)
