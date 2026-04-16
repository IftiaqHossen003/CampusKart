from django.conf import settings
from django.db import models

from apps.products.models import Product


class WishlistItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wishlist_items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="wishlisted_by",
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wishlist_items"
        ordering = ["-added_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "product"], name="uniq_wishlist_user_product"),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.product_id}"
