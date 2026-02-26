from django.db import models
from django.conf import settings


class Notification(models.Model):
    class Type(models.TextChoices):
        ORDER = "order", "Order Update"
        PAYMENT = "payment", "Payment"
        CHAT = "chat", "New Message"
        PROMOTION = "promo", "Promotion"
        SYSTEM = "system", "System"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    notification_type = models.CharField(max_length=15, choices=Type.choices)
    title = models.CharField(max_length=200)
    body = models.TextField()
    is_read = models.BooleanField(default=False)
    data = models.JSONField(default=dict, blank=True)  # extra payload
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.recipient} — {self.title}"
