from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["payment_id", "order", "user", "gateway", "amount", "status", "created_at"]
    list_filter = ["gateway", "status"]
    search_fields = ["payment_id", "user__email", "gateway_payment_id"]
    readonly_fields = ["payment_id", "raw_response", "created_at"]
