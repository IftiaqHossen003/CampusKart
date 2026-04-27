from django.contrib import admin
from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["user", "product", "order", "rating", "is_approved", "created_at"]
    list_filter = ["rating", "is_approved"]
    search_fields = ["user__email", "product__name", "order__order_number"]
