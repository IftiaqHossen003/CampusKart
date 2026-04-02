from django.contrib import admin
from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["reviewer", "product", "vendor", "rating", "is_verified_purchase", "created_at"]
    list_filter = ["rating", "is_verified_purchase"]
    search_fields = ["reviewer__email", "product__name", "vendor__shop_name"]
