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


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            Order.Status.CONFIRMED,
            Order.Status.SHIPPED,
            Order.Status.DELIVERED,
        ]
    )

    _NEXT_ALLOWED_STATUS = {
        Order.Status.PENDING: Order.Status.CONFIRMED,
        Order.Status.CONFIRMED: Order.Status.SHIPPED,
        Order.Status.SHIPPED: Order.Status.DELIVERED,
    }

    default_error_messages = {
        "invalid_transition": "Invalid status transition from '{current}' to '{next_status}'.",
    }

    def validate(self, attrs):
        order = self.context.get("order")
        next_status = attrs["status"]

        if order is None:
            raise serializers.ValidationError({"detail": "Order context is required."})

        expected = self._NEXT_ALLOWED_STATUS.get(order.status)
        if expected != next_status:
            self.fail(
                "invalid_transition",
                current=order.status,
                next_status=next_status,
            )

        return attrs
