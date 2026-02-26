from django.contrib import admin
from .models import Category, Product, ProductImage


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent"]
    prepopulated_fields = {"slug": ("name",)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "vendor", "category", "price", "stock", "condition", "is_active"]
    list_filter = ["condition", "is_active", "is_featured", "category"]
    search_fields = ["name", "vendor__shop_name"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductImageInline]
