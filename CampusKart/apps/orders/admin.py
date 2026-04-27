from django.contrib import admin
from .models import Order, OrderItem
from apps.vendors.models import VendorProfile


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["subtotal"]


class OrderVendorFilter(admin.SimpleListFilter):
    title = "vendor"
    parameter_name = "vendor"

    def lookups(self, request, model_admin):
        return [
            (str(vendor.id), vendor.shop_name)
            for vendor in VendorProfile.objects.order_by("shop_name")
        ]

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset
        return queryset.filter(items__product__vendor_id=value).distinct()


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "buyer", "status", "total_amount", "created_at"]
    list_filter = ["status", OrderVendorFilter]
    search_fields = ["order_number", "buyer__email"]
    inlines = [OrderItemInline]
    readonly_fields = ["order_number", "created_at"]
