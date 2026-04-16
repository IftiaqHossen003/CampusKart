from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, OrderItem, VendorOrder
from apps.products.models import Category, Product
from apps.reviews.models import Review
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "reviews-tests-cache",
        }
    }
)
class ProductReviewsApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer-reviews@example.com",
            password="StrongPass123!",
            full_name="Buyer Reviews",
            role="student",
            is_verified=True,
        )
        self.other_buyer = user_model.objects.create_user(
            email="other-buyer-reviews@example.com",
            password="StrongPass123!",
            full_name="Other Buyer Reviews",
            role="student",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-reviews@example.com",
            password="StrongPass123!",
            full_name="Vendor Reviews",
            role="vendor",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Reviews Shop",
            status=VendorProfile.Status.APPROVED,
        )
        self.category = Category.objects.create(name="Reviews", slug="reviews")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Reviewable Product",
            slug="reviewable-product",
            description="test",
            price="100.00",
            stock=20,
            status=Product.Status.APPROVED,
        )
        self.reviews_url = f"/api/v1/products/{self.product.id}/reviews/"
        self.eligibility_url = f"/api/v1/products/{self.product.id}/review-eligibility/"

    def _create_order(self, *, buyer, status_value):
        order = Order.objects.create(
            buyer=buyer,
            status=status_value,
            delivery_address="Dorm",
            payment_method=Order.PaymentMethod.COD,
            total_amount="100.00",
        )
        vendor_order = VendorOrder.objects.create(
            order=order,
            vendor=self.vendor,
            status=status_value,
            subtotal_amount="100.00",
            commission_rate="10.00",
            commission_amount="10.00",
            net_vendor_amount="90.00",
        )
        OrderItem.objects.create(
            order=order,
            vendor_order=vendor_order,
            product=self.product,
            quantity=1,
            unit_price="100.00",
        )
        return order

    def test_buyer_can_post_review_for_delivered_order_only(self):
        delivered_order = self._create_order(buyer=self.buyer, status_value=Order.Status.DELIVERED)
        pending_order = self._create_order(buyer=self.buyer, status_value=Order.Status.PENDING)

        self.client.force_authenticate(user=self.buyer)

        success_response = self.client.post(
            self.reviews_url,
            {
                "order": delivered_order.id,
                "rating": 5,
                "comment": "Great product",
            },
            format="json",
        )
        self.assertEqual(success_response.status_code, status.HTTP_201_CREATED)

        fail_response = self.client.post(
            self.reviews_url,
            {
                "order": pending_order.id,
                "rating": 4,
                "comment": "Should fail",
            },
            format="json",
        )
        self.assertEqual(fail_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unique_review_per_user_product_order_is_enforced(self):
        delivered_order = self._create_order(buyer=self.buyer, status_value=Order.Status.DELIVERED)

        self.client.force_authenticate(user=self.buyer)
        first = self.client.post(
            self.reviews_url,
            {
                "order": delivered_order.id,
                "rating": 4,
                "comment": "First review",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            self.reviews_url,
            {
                "order": delivered_order.id,
                "rating": 5,
                "comment": "Duplicate review",
            },
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_reviews_returns_stats_and_updates_product_avg_rating(self):
        delivered_order_buyer = self._create_order(buyer=self.buyer, status_value=Order.Status.DELIVERED)
        delivered_order_other = self._create_order(buyer=self.other_buyer, status_value=Order.Status.DELIVERED)

        Review.objects.create(user=self.buyer, product=self.product, order=delivered_order_buyer, rating=5, comment="Great")
        Review.objects.create(user=self.other_buyer, product=self.product, order=delivered_order_other, rating=3, comment="Okay")

        self.product.refresh_from_db()
        self.assertEqual(str(self.product.avg_rating), "4.00")

        response = self.client.get(self.reviews_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("stats", response.data)
        self.assertEqual(response.data["stats"]["total_reviews"], 2)
        self.assertEqual(response.data["stats"]["rating_counts"]["5"], 1)
        self.assertEqual(response.data["stats"]["rating_counts"]["3"], 1)

    def test_get_reviews_is_paginated_in_batches_of_five(self):
        for idx in range(6):
            reviewer = get_user_model().objects.create_user(
                email=f"reviewer-{idx}@example.com",
                password="StrongPass123!",
                full_name=f"Reviewer {idx}",
                role="student",
                is_verified=True,
            )
            delivered_order = self._create_order(buyer=reviewer, status_value=Order.Status.DELIVERED)
            Review.objects.create(
                user=reviewer,
                product=self.product,
                order=delivered_order,
                rating=5,
                comment=f"Review {idx}",
            )

        response = self.client.get(self.reviews_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data.get("next"))

    def test_review_eligibility_returns_only_unreviewed_delivered_orders_for_user(self):
        delivered = self._create_order(buyer=self.buyer, status_value=Order.Status.DELIVERED)
        pending = self._create_order(buyer=self.buyer, status_value=Order.Status.PENDING)
        other_users_delivered = self._create_order(buyer=self.other_buyer, status_value=Order.Status.DELIVERED)

        Review.objects.create(
            user=self.buyer,
            product=self.product,
            order=delivered,
            rating=4,
            comment="Already reviewed",
        )

        # Keep variables referenced to make intent explicit for future maintainers.
        self.assertIsNotNone(pending)
        self.assertIsNotNone(other_users_delivered)

        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(self.eligibility_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["can_review"])
        self.assertEqual(response.data["eligible_orders"], [])

    def test_review_eligibility_includes_delivered_order_when_not_reviewed(self):
        delivered = self._create_order(buyer=self.buyer, status_value=Order.Status.DELIVERED)
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.eligibility_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_review"])
        self.assertEqual(len(response.data["eligible_orders"]), 1)
        self.assertEqual(response.data["eligible_orders"][0]["id"], delivered.id)
