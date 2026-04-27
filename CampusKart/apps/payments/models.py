import uuid
from django.db import models
from django.conf import settings
from apps.orders.models import Order, VendorOrder


class Payment(models.Model):
    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    class Gateway(models.TextChoices):
        COD = "cod", "Cash on Delivery"
        SSLCOMMERZ = "sslcommerz", "SSLCommerz"

    payment_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="payment")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payments"
    )
    gateway = models.CharField(max_length=15, choices=Gateway.choices)
    idempotency_key = models.CharField(max_length=100, unique=True, null=True, blank=True)
    gateway_payment_id = models.CharField(max_length=200, blank=True)
    gateway_order_id = models.CharField(max_length=200, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=5, default="BDT")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.INITIATED)
    webhook_fingerprint = models.CharField(max_length=128, blank=True)
    callback_received_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        ordering = ["-created_at"]

    def __str__(self):
        return str(self.payment_id)


class VendorPayout(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        READY = "ready", "Ready"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="vendor_payouts")
    vendor_order = models.OneToOneField(
        VendorOrder,
        on_delete=models.CASCADE,
        related_name="vendor_payout",
    )
    vendor = models.ForeignKey(
        "vendors.VendorProfile",
        on_delete=models.CASCADE,
        related_name="payouts",
    )
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    release_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payout_reference = models.CharField(max_length=200, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "vendor_payouts"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["payment", "vendor_order"],
                name="uniq_vendor_payout_per_payment_vendor_order",
            ),
        ]

    def __str__(self):
        return f"{self.payment_id}:{self.vendor_order_id}:{self.status}"
