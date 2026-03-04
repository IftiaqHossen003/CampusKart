from django.db import models
from django.conf import settings


class VendorProfile(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        SUSPENDED = "suspended", "Suspended"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vendor_profile"
    )
    shop_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to="vendor_logos/", null=True, blank=True)
    banner = models.ImageField(upload_to="vendor_banners/", null=True, blank=True)
    college = models.CharField(max_length=200)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    total_sales = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "vendor_profiles"
        ordering = ["-created_at"]

    def __str__(self):
        return self.shop_name
