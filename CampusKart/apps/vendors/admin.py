from django.contrib import admin
from .models import VendorProfile


@admin.register(VendorProfile)
class VendorProfileAdmin(admin.ModelAdmin):
    list_display = ["shop_name", "user", "college", "status", "is_featured", "created_at"]
    list_filter = ["status", "is_featured"]
    search_fields = ["shop_name", "college", "user__email"]
    list_editable = ["status", "is_featured"]
