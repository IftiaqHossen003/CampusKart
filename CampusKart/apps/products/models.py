from django.conf import settings
from django.db import models

from apps.vendors.models import VendorProfile


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class Category(models.Model):
    name     = models.CharField(max_length=100, unique=True)
    slug     = models.SlugField(max_length=120, unique=True)
    parent   = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="children",
    )
    icon_url  = models.URLField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "categories"
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def get_absolute_url(self) -> str:
        from django.urls import reverse
        return reverse("products:category-list") + f"?category={self.slug}"


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

class Product(models.Model):
    class Status(models.TextChoices):
        PENDING  = "pending",  "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    # ── Relationships ────────────────────────────────────────────────────────
    vendor   = models.ForeignKey(
        VendorProfile, on_delete=models.CASCADE, related_name="products"
    )
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="products",
    )

    # ── Identity ─────────────────────────────────────────────────────────────
    name        = models.CharField(max_length=255)
    slug        = models.SlugField(max_length=280, unique=True)
    description = models.TextField()
    sku         = models.CharField(max_length=100, unique=True, null=True, blank=True)

    # ── Pricing & stock ──────────────────────────────────────────────────────
    price          = models.DecimalField(max_digits=10, decimal_places=2)
    discount_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Leave blank if there is no active discount.",
    )
    stock = models.PositiveIntegerField(default=0)

    # ── Review / approval ────────────────────────────────────────────────────
    status      = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_products",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    # ── Aggregates (denormalised for fast reads) ─────────────────────────────
    total_sold = models.PositiveIntegerField(default=0)
    avg_rating = models.DecimalField(max_digits=3, decimal_places=2, default="0.00")

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "products"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "category", "created_at"],
                name="idx_product_status_cat_date",
            ),
            models.Index(
                fields=["vendor", "status"],
                name="idx_product_vendor_status",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def get_absolute_url(self) -> str:
        from django.urls import reverse
        return reverse("products:product-detail", kwargs={"slug": self.slug})

    @property
    def effective_price(self):
        """Return discounted price when active, otherwise regular price."""
        return self.discount_price if self.discount_price else self.price

    @property
    def is_in_stock(self) -> bool:
        return self.stock > 0


# ---------------------------------------------------------------------------
# ProductImage
# ---------------------------------------------------------------------------

class ProductImage(models.Model):
    product    = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image_url  = models.URLField(max_length=500, null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "product_images"
        ordering = ["sort_order"]

    def __str__(self) -> str:
        return f"Image for '{self.product.name}' (order={self.sort_order})"


# ---------------------------------------------------------------------------
# ProductTag
# ---------------------------------------------------------------------------

class ProductTag(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="tags")
    tag     = models.CharField(max_length=50, db_index=True)

    class Meta:
        db_table = "product_tags"
        unique_together = [("product", "tag")]
        ordering = ["tag"]

    def __str__(self) -> str:
        return f"{self.product.name} — #{self.tag}"
