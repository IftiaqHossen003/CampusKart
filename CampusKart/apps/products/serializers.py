from rest_framework import serializers
from .models import Category, Product, ProductImage


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "is_primary", "order"]


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    vendor_name = serializers.CharField(source="vendor.shop_name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "vendor_name", "category", "category_name", "name", "slug",
            "description", "price", "stock", "condition", "is_active",
            "is_featured", "images", "created_at",
        ]
        read_only_fields = ["id", "slug", "created_at"]
