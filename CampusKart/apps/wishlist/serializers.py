from rest_framework import serializers

from apps.products.models import Product

from .models import WishlistItem


class WishlistProductSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.shop_name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "slug",
            "price",
            "discount_price",
            "avg_rating",
            "status",
            "vendor_name",
        ]


class WishlistItemSerializer(serializers.ModelSerializer):
    product = WishlistProductSerializer(read_only=True)

    class Meta:
        model = WishlistItem
        fields = ["id", "product", "added_at"]
        read_only_fields = ["id", "added_at"]


class WishlistToggleSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)

    def validate_product_id(self, value):
        if not Product.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Product not found.")
        return value
