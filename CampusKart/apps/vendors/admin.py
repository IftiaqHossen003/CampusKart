from django.contrib import admin
from .models import VendorProfile


@admin.register(VendorProfile)
class VendorProfileAdmin(admin.ModelAdmin):
    list_display = ["shop_name", "shop_slug", "user", "status", "commission_rate", "total_earnings", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["shop_name", "shop_slug", "contact_email", "user__email"]
    list_editable = ["status", "commission_rate"]
