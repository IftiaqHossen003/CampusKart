from rest_framework import serializers

from .models import Category, Product, ProductImage, ProductTag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "icon_url", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image_url", "is_primary", "sort_order"]


class ProductTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTag
        fields = ["id", "tag"]


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    tags = ProductTagSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    vendor_name = serializers.CharField(source="vendor.shop_name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "vendor_name", "category", "category_name", "name", "slug",
            "description", "price", "discount_price", "stock", "sku", "status",
            "approved_by", "approved_at", "total_sold", "avg_rating",
            "images", "tags", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "slug", "approved_by", "approved_at", "total_sold", "avg_rating",
            "created_at", "updated_at",
        ]
