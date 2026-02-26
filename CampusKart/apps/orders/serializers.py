from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "unit_price", "subtotal"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    buyer_email = serializers.EmailField(source="buyer.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "buyer_email", "status", "total_amount",
            "delivery_address", "notes", "items", "created_at",
        ]
        read_only_fields = ["id", "order_number", "total_amount", "created_at"]


class CreateOrderSerializer(serializers.Serializer):
    delivery_address = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(), min_length=1
    )
