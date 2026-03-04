from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.products.models import Product
from apps.vendors.models import VendorProfile


class Review(models.Model):
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews"
    )
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="reviews", null=True, blank=True
    )
    vendor = models.ForeignKey(
        VendorProfile, on_delete=models.CASCADE, related_name="reviews", null=True, blank=True
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(max_length=150, blank=True)
    body = models.TextField()
    is_verified_purchase = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reviews"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False) | models.Q(vendor__isnull=False)
                ),
                name="review_must_target_product_or_vendor",
            )
        ]

    def __str__(self):
        target = self.product or self.vendor
        return f"{self.reviewer} — {target} ({self.rating}★)"
