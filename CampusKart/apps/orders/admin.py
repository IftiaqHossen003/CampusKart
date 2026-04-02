from django.contrib import admin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["subtotal"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "buyer", "status", "total_amount", "created_at"]
    list_filter = ["status"]
    search_fields = ["order_number", "buyer__email"]
    inlines = [OrderItemInline]
    readonly_fields = ["order_number", "created_at"]
