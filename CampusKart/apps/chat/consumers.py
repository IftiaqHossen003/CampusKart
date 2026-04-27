import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db import models
from django.utils import timezone

from .models import ChatMessage, ChatRoom


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"chat_{self.room_id}"

        user = self.scope["user"]
        if not user.is_authenticated:
            await self.close()
            return

        if not await self.user_in_room(user.id):
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.mark_room_read(user.id)

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        user = self.scope["user"]
        if not await self.user_in_room(user.id):
            await self.close()
            return

        event_type = data.get("type")
        if event_type == "typing":
            await self.handle_typing_event(data=data, user=user)
            return

        if event_type == "read_receipt":
            await self.handle_read_receipt_event(data=data, user=user)
            return

        message_text = data.get("message", "").strip()
        if not message_text:
            return

        msg = await self.save_message(user.id, message_text)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message_text,
                "sender_id": user.id,
                "sender_email": user.email,
                "message_id": msg.pk,
                "is_read": msg.is_read,
                "sent_at": msg.sent_at.isoformat(),
            },
        )

    async def handle_typing_event(self, data, user):
        is_typing = bool(data.get("is_typing", True))
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "typing_event",
                "event": {
                    "type": "typing",
                    "room_id": int(self.room_id),
                    "sender_id": user.id,
                    "is_typing": is_typing,
                },
            },
        )

    async def handle_read_receipt_event(self, data, user):
        try:
            message_id = int(data.get("message_id"))
        except (TypeError, ValueError):
            return

        message = await self.mark_message_read(message_id=message_id, user_id=user.id)
        if not message:
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "read_receipt_event",
                "event": {
                    "type": "read_receipt",
                    "room_id": int(self.room_id),
                    "message_id": message.pk,
                    "reader_id": user.id,
                    "read_at": timezone.now().isoformat(),
                },
            },
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps(event["event"]))

    async def read_receipt_event(self, event):
        await self.send(text_data=json.dumps(event["event"]))

    @database_sync_to_async
    def save_message(self, user_id, message):
        return ChatMessage.objects.create(
            room_id=self.room_id,
            sender_id=user_id,
            message=message,
        )

    @database_sync_to_async
    def user_in_room(self, user_id):
        return ChatRoom.objects.filter(pk=self.room_id).filter(
            models.Q(buyer_id=user_id) | models.Q(vendor__user_id=user_id)
        ).exists()

    @database_sync_to_async
    def mark_room_read(self, user_id):
        return ChatMessage.objects.filter(room_id=self.room_id, is_read=False).exclude(
            sender_id=user_id
        ).update(is_read=True)

    @database_sync_to_async
    def mark_message_read(self, message_id, user_id):
        try:
            message = ChatMessage.objects.get(pk=message_id, room_id=self.room_id)
        except ChatMessage.DoesNotExist:
            return None

        if message.sender_id == user_id:
            return None

        if not message.is_read:
            message.is_read = True
            message.save(update_fields=["is_read"])

        return message
