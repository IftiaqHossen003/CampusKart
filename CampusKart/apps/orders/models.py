import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from apps.products.models import Product
from apps.vendors.models import VendorProfile


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        SHIPPED = "shipped", "Shipped"
        PARTIALLY_SHIPPED = "partially_shipped", "Partially Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    class PaymentMethod(models.TextChoices):
        COD = "cod", "Cash on Delivery"
        SSLCOMMERZ = "sslcommerz", "SSLCommerz"

    order_number = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.COD,
    )
    checkout_request_id = models.CharField(max_length=100, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_address = models.TextField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "orders"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["buyer", "checkout_request_id"],
                condition=models.Q(checkout_request_id__isnull=False),
                name="uniq_order_checkout_req_per_buyer",
            ),
        ]

    def __str__(self):
        return str(self.order_number)


class VendorOrder(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="vendor_orders")
    vendor = models.ForeignKey(
        VendorProfile,
        on_delete=models.CASCADE,
        related_name="vendor_orders",
    )
    status = models.CharField(max_length=20, choices=Order.Status.choices, default=Order.Status.PENDING)
    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_vendor_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "vendor_orders"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["order", "vendor"], name="uniq_vendor_order_per_order")
        ]

    def __str__(self):
        return f"{self.order_id}:{self.vendor_id}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    vendor_order = models.ForeignKey(
        VendorOrder,
        on_delete=models.SET_NULL,
        related_name="items",
        null=True,
        blank=True,
    )
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "order_items"

    @property
    def subtotal(self):
        unit_price = self.unit_price if self.unit_price is not None else Decimal("0")
        quantity = self.quantity if self.quantity is not None else 0
        return unit_price * quantity

    def __str__(self):
        return f"{self.product} x{self.quantity}"


class DomainEvent(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSED = "processed", "Processed"
        FAILED = "failed", "Failed"

    event_type = models.CharField(max_length=80)
    idempotency_key = models.CharField(max_length=160, unique=True, null=True, blank=True)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="domain_events",
        null=True,
        blank=True,
    )
    vendor_order = models.ForeignKey(
        VendorOrder,
        on_delete=models.CASCADE,
        related_name="domain_events",
        null=True,
        blank=True,
    )
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    retry_count = models.PositiveIntegerField(default=0)
    error_message = models.CharField(max_length=255, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "domain_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "status"], name="idx_domain_event_type_status"),
            models.Index(fields=["status", "created_at"], name="idx_dm_evt_stat_created"),
        ]

    def __str__(self):
        return f"{self.event_type}:{self.status}"


class DomainEventAdminAudit(models.Model):
    class Action(models.TextChoices):
        RETRY_SINGLE = "retry_single", "Retry Single"
        RETRY_BULK = "retry_bulk", "Retry Bulk"
        RETRY_BULK_DRY_RUN = "retry_bulk_dry_run", "Retry Bulk Dry Run"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="domain_event_admin_audits",
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    event_id = models.IntegerField(null=True, blank=True)
    filters = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "domain_event_admin_audits"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "created_at"], name="idx_dm_evt_ad_act_created"),
            models.Index(fields=["actor", "created_at"], name="idx_dm_evt_ad_actor_created"),
        ]

    def __str__(self):
        return f"{self.action}:{self.event_id or '-'}"
