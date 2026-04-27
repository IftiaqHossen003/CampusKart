from django.db import models
from django.conf import settings

from apps.products.models import Product
from apps.vendors.models import VendorProfile


class ChatRoom(models.Model):
    """A private chat room between one buyer and one vendor."""

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="buyer_chat_rooms",
    )
    vendor = models.ForeignKey(
        VendorProfile,
        on_delete=models.CASCADE,
        related_name="vendor_chat_rooms",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_rooms",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_rooms"
        constraints = [
            models.UniqueConstraint(
                fields=["buyer", "vendor", "product"],
                condition=models.Q(product__isnull=False),
                name="uniq_chatroom_buyer_vendor_product_non_null",
            ),
            models.UniqueConstraint(
                fields=["buyer", "vendor"],
                condition=models.Q(product__isnull=True),
                name="uniq_chatroom_buyer_vendor_when_product_null",
            ),
        ]
        indexes = [
            models.Index(fields=["buyer", "created_at"], name="idx_chatroom_buyer_created"),
            models.Index(fields=["vendor", "created_at"], name="idx_chatroom_vendor_created"),
        ]

    def __str__(self):
        return f"Room {self.pk} ({self.buyer_id}->{self.vendor_id})"

    def has_participant(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        vendor_user_id = None
        if self.vendor_id:
            vendor_user_id = self.vendor.user_id
        return self.buyer_id == user.id or vendor_user_id == user.id


class ChatMessage(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages"
    )
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_messages"
        ordering = ["sent_at"]
        indexes = [
            models.Index(fields=["room", "sent_at"], name="idx_chatmessage_room_sent"),
            models.Index(fields=["room", "is_read"], name="idx_chatmessage_room_read"),
        ]

    def __str__(self):
        return f"{self.sender_id} @ {self.room_id}"
