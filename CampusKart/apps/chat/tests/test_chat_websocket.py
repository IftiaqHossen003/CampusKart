from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from CampusKart.asgi import application
from apps.chat.models import ChatMessage, ChatRoom
from apps.vendors.models import VendorProfile


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
)
class ChatWebSocketTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        user_model = get_user_model()

        self.buyer = user_model.objects.create_user(
            email="ws-buyer@example.com",
            password="StrongPass123!",
            full_name="WS Buyer",
            role="student",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="ws-vendor@example.com",
            password="StrongPass123!",
            full_name="WS Vendor",
            role="vendor",
            is_verified=True,
        )
        self.other_user = user_model.objects.create_user(
            email="ws-other@example.com",
            password="StrongPass123!",
            full_name="WS Other",
            role="student",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="WS Vendor Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.room = ChatRoom.objects.create(
            buyer=self.buyer,
            vendor=self.vendor,
            product=None,
        )

    @staticmethod
    def _token_for(user):
        return str(AccessToken.for_user(user))

    def _query_communicator(self, user):
        token = self._token_for(user)
        path = f"/ws/chat/{self.room.id}/?token={token}"
        return WebsocketCommunicator(application, path)

    def _header_communicator(self, user):
        token = self._token_for(user)
        headers = [(b"authorization", f"Bearer {token}".encode("utf-8"))]
        path = f"/ws/chat/{self.room.id}/"
        return WebsocketCommunicator(application, path, headers=headers)

    def test_connect_allows_participant_with_query_token(self):
        async def scenario():
            communicator = self._query_communicator(self.buyer)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_connect_allows_participant_with_authorization_header(self):
        async def scenario():
            communicator = self._header_communicator(self.vendor_user)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_connect_rejects_non_participant(self):
        async def scenario():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/chat/{self.room.id}/?token={self._token_for(self.other_user)}",
            )
            connected, _ = await communicator.connect()
            self.assertFalse(connected)

        async_to_sync(scenario)()

    def test_broadcast_persists_message_for_room_members(self):
        async def scenario():
            buyer_socket = self._query_communicator(self.buyer)
            vendor_socket = self._query_communicator(self.vendor_user)

            buyer_connected, _ = await buyer_socket.connect()
            vendor_connected, _ = await vendor_socket.connect()

            self.assertTrue(buyer_connected)
            self.assertTrue(vendor_connected)

            await buyer_socket.send_json_to({"message": "Hello vendor"})

            buyer_event = await buyer_socket.receive_json_from()
            vendor_event = await vendor_socket.receive_json_from()

            self.assertEqual(buyer_event["message"], "Hello vendor")
            self.assertEqual(vendor_event["message"], "Hello vendor")
            self.assertEqual(vendor_event["sender_id"], self.buyer.id)

            await buyer_socket.disconnect()
            await vendor_socket.disconnect()

        async_to_sync(scenario)()

        self.assertTrue(
            ChatMessage.objects.filter(
                room=self.room,
                sender=self.buyer,
                message="Hello vendor",
            ).exists()
        )

    def test_connect_marks_unread_incoming_messages_as_read(self):
        incoming = ChatMessage.objects.create(
            room=self.room,
            sender=self.vendor_user,
            message="Unread before connect",
            is_read=False,
        )
        own_message = ChatMessage.objects.create(
            room=self.room,
            sender=self.buyer,
            message="Own unread should stay false",
            is_read=False,
        )

        async def scenario():
            communicator = self._query_communicator(self.buyer)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

        incoming.refresh_from_db()
        own_message.refresh_from_db()

        self.assertTrue(incoming.is_read)
        self.assertFalse(own_message.is_read)
