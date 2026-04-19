from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.chat.models import ChatMessage, ChatRoom
from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "chat-tests-cache",
        }
    }
)
class ChatApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="buyer@example.com",
            password="StrongPass123!",
            full_name="Buyer",
            role="student",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor@example.com",
            password="StrongPass123!",
            full_name="Vendor",
            role="vendor",
            is_verified=True,
        )
        self.other_buyer = user_model.objects.create_user(
            email="other-buyer@example.com",
            password="StrongPass123!",
            full_name="Other Buyer",
            role="student",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Vendor Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(name="Books", slug="books")
        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Linear Algebra",
            slug="linear-algebra",
            description="Textbook",
            price="600.00",
            stock=10,
            status=Product.Status.APPROVED,
        )

        self.rooms_url = "/api/v1/chat/rooms/"

    def test_student_can_create_room(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.post(
            self.rooms_url,
            {"vendor_id": self.vendor.id, "product_id": self.product.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ChatRoom.objects.count(), 1)
        room = ChatRoom.objects.get()
        self.assertEqual(room.buyer_id, self.buyer.id)
        self.assertEqual(room.vendor_id, self.vendor.id)
        self.assertEqual(room.product_id, self.product.id)

    def test_vendor_can_create_room(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.post(
            self.rooms_url,
            {"buyer_id": self.buyer.id, "product_id": self.product.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        room = ChatRoom.objects.get()
        self.assertEqual(room.buyer_id, self.buyer.id)
        self.assertEqual(room.vendor_id, self.vendor.id)

    def test_create_room_is_idempotent_for_same_tuple(self):
        self.client.force_authenticate(user=self.buyer)

        first = self.client.post(
            self.rooms_url,
            {"vendor_id": self.vendor.id, "product_id": self.product.id},
            format="json",
        )
        second = self.client.post(
            self.rooms_url,
            {"vendor_id": self.vendor.id, "product_id": self.product.id},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ChatRoom.objects.count(), 1)
        self.assertEqual(first.data["id"], second.data["id"])

    def test_create_room_is_idempotent_when_product_is_null(self):
        self.client.force_authenticate(user=self.buyer)

        first = self.client.post(
            self.rooms_url,
            {"vendor_id": self.vendor.id},
            format="json",
        )
        second = self.client.post(
            self.rooms_url,
            {"vendor_id": self.vendor.id, "product_id": None},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ChatRoom.objects.count(), 1)
        self.assertEqual(first.data["id"], second.data["id"])

    def test_list_rooms_returns_only_current_user_rooms(self):
        own_room = ChatRoom.objects.create(buyer=self.buyer, vendor=self.vendor, product=self.product)
        ChatRoom.objects.create(buyer=self.other_buyer, vendor=self.vendor, product=self.product)

        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(self.rooms_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], own_room.id)

    def test_messages_are_newest_first_and_marked_read_on_open(self):
        room = ChatRoom.objects.create(buyer=self.buyer, vendor=self.vendor, product=self.product)
        first = ChatMessage.objects.create(room=room, sender=self.vendor_user, message="First")
        second = ChatMessage.objects.create(room=room, sender=self.vendor_user, message="Second")
        self_message = ChatMessage.objects.create(room=room, sender=self.buyer, message="Mine")

        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/v1/chat/rooms/{room.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual([msg["id"] for msg in results], [self_message.id, second.id, first.id])

        first.refresh_from_db()
        second.refresh_from_db()
        self_message.refresh_from_db()
        self.assertTrue(first.is_read)
        self.assertTrue(second.is_read)
        self.assertFalse(self_message.is_read)

    def test_messages_use_cursor_pagination(self):
        room = ChatRoom.objects.create(buyer=self.buyer, vendor=self.vendor, product=self.product)
        for i in range(55):
            ChatMessage.objects.create(room=room, sender=self.vendor_user, message=f"Message {i}")

        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(f"/api/v1/chat/rooms/{room.id}/messages/?page_size=20")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("next", response.data)
        self.assertIn("previous", response.data)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])
        self.assertIsNone(response.data["previous"])

    def test_non_participant_cannot_access_room_messages(self):
        room = ChatRoom.objects.create(buyer=self.buyer, vendor=self.vendor, product=self.product)
        ChatMessage.objects.create(room=room, sender=self.vendor_user, message="Hello")

        self.client.force_authenticate(user=self.other_buyer)
        response = self.client.get(f"/api/v1/chat/rooms/{room.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
