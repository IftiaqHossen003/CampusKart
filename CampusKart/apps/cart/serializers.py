from decimal import Decimal

from rest_framework import serializers

from apps.products.models import Product

from .models import Cart, CartItem


class CartProductSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.CharField(read_only=True)
    thumbnail = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    raw_price = serializers.DecimalField(source="price", max_digits=10, decimal_places=2, read_only=True)
    discount_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    stock = serializers.IntegerField(read_only=True)

    def get_thumbnail(self, obj):
        images = list(obj.images.all())

        for image in images:
            if image.is_primary and image.image_url:
                return image.image_url

        for image in images:
            if image.image_url:
                return image.image_url

        return None

    def get_price(self, obj):
        return obj.effective_price


class CartItemSerializer(serializers.ModelSerializer):
    product = CartProductSummarySerializer(read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ["id", "quantity", "added_at", "subtotal", "product"]

    def get_subtotal(self, obj):
        return obj.product.effective_price * obj.quantity


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "items", "total_items", "total_quantity", "total_amount"]

    def get_total_items(self, obj):
        return len(obj.items.all())

    def get_total_quantity(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_total_amount(self, obj):
        total = Decimal("0.00")
        for item in obj.items.all():
            total += item.product.effective_price * item.quantity
        return total


class CartReplaceItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField()

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value


class CartReplaceSerializer(serializers.Serializer):
    items = CartReplaceItemSerializer(many=True, required=False, default=list)
    merge = serializers.BooleanField(required=False, default=False)


class CartItemCreateSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    quantity = serializers.IntegerField(required=False, default=1)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value

    def validate(self, attrs):
        product = attrs.get("product")
        product_id = attrs.get("product_id")

        if product and product_id and product != product_id:
            raise serializers.ValidationError(
                {"detail": "Conflicting values provided for 'product' and 'product_id'."}
            )

        resolved_product = product or product_id
        if not resolved_product:
            raise serializers.ValidationError(
                {"detail": "Either 'product' or 'product_id' must be provided."}
            )

        attrs["product"] = resolved_product
        return attrs

class CartItemQuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField()

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be a positive integer.")
        return value
