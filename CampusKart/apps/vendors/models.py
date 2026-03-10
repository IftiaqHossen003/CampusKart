from django.db import models
from django.conf import settings
from django.utils.text import slugify


class VendorProfile(models.Model):
    class Status(models.TextChoices):
        PENDING   = "pending",   "Pending"
        APPROVED  = "approved",  "Approved"
        SUSPENDED = "suspended", "Suspended"

    # ── Core identity ────────────────────────────────────────────────────────
    user      = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="vendor_profile",
    )
    shop_name = models.CharField(max_length=200)
    shop_slug = models.SlugField(max_length=220, unique=True, null=True, blank=True)
    description = models.TextField(blank=True)

    # ── Media ────────────────────────────────────────────────────────────────
    logo_url   = models.URLField(max_length=500, blank=True)
    banner_url = models.URLField(max_length=500, blank=True)

    # ── Contact ──────────────────────────────────────────────────────────────
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    address       = models.TextField(blank=True)

    # ── Status & financials ──────────────────────────────────────────────────
    status          = models.CharField(
        max_length=15, choices=Status.choices, default=Status.PENDING
    )
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default="10.00",
        help_text="Platform commission percentage charged on each sale.",
    )
    total_earnings  = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # ── Approval ─────────────────────────────────────────────────────────────
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_vendors",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "vendor_profiles"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.shop_name

    def get_absolute_url(self) -> str:
        from django.urls import reverse
        return reverse("vendors:vendor-detail", kwargs={"pk": self.pk})

    def save(self, *args, **kwargs):
        if not self.shop_slug:
            self.shop_slug = slugify(self.shop_name)
        super().save(*args, **kwargs)

    @property
    def is_approved(self) -> bool:
        return self.status == self.Status.APPROVED
