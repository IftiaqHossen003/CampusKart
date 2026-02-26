from django.db import models
from django.conf import settings


class ChatRoom(models.Model):
    """A private chat room between a buyer and a vendor."""
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="chat_rooms"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_rooms"

    def __str__(self):
        return f"Room {self.pk}"


class Message(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages"
    )
    content = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender} @ {self.room}"
