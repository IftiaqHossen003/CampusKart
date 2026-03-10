from django.contrib import admin

from .models import Category, Product, ProductImage, ProductTag


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "is_active"]
    list_filter = ["is_active"]
    prepopulated_fields = {"slug": ("name",)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "vendor", "category", "price", "discount_price", "stock", "status", "total_sold", "avg_rating"]
    list_filter = ["status", "category", "vendor", "created_at"]
    search_fields = ["name", "slug", "sku", "vendor__shop_name"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductImageInline]


@admin.register(ProductTag)
class ProductTagAdmin(admin.ModelAdmin):
    list_display = ["product", "tag"]
    search_fields = ["tag", "product__name"]
