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
    delivery_address = serializers.JSONField(required=False)
    deliveryAddress = serializers.JSONField(required=False, write_only=True)
    payment_method = serializers.CharField(required=False, allow_blank=True, write_only=True)
    paymentMethod = serializers.CharField(required=False, allow_blank=True, write_only=True)
    full_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    address_line = serializers.CharField(required=False, allow_blank=True, write_only=True)
    area_city = serializers.CharField(required=False, allow_blank=True, write_only=True)
    items = serializers.ListField(required=False, write_only=True)
    notes = serializers.CharField(required=False, allow_blank=True)
<<<<<<< Updated upstream
    items = serializers.ListField(
        child=serializers.DictField(), min_length=1
=======

    default_error_messages = {
        "delivery_address_required": "Delivery address is required.",
        "delivery_address_invalid": "Delivery address must be a non-empty string or an object.",
    }

    @staticmethod
    def _compose_address_from_parts(parts: dict) -> str:
        full_name = str(parts.get("full_name") or parts.get("fullName") or "").strip()
        phone = str(parts.get("phone") or parts.get("phone_number") or "").strip()
        address_line = str(
            parts.get("address_line")
            or parts.get("addressLine")
            or parts.get("line1")
            or parts.get("address")
            or ""
        ).strip()
        area_city = str(parts.get("area_city") or parts.get("areaCity") or parts.get("city") or "").strip()

        # A concrete address line is required to place an order.
        if not address_line:
            return ""

        return ", ".join([piece for piece in [full_name, phone, address_line, area_city] if piece])

    def _normalize_delivery_address(self, value):
        if isinstance(value, str):
            normalized = value.strip()
            if normalized:
                return normalized
            self.fail("delivery_address_invalid")

        if isinstance(value, dict):
            normalized = self._compose_address_from_parts(value)
            if normalized:
                return normalized
            self.fail("delivery_address_invalid")

        self.fail("delivery_address_invalid")

    def validate(self, attrs):
        raw_payload = self.initial_data if isinstance(self.initial_data, dict) else {}

        raw_address = attrs.get("delivery_address")
        if raw_address is None and "deliveryAddress" in attrs:
            raw_address = attrs.get("deliveryAddress")

        if raw_address is not None:
            attrs["delivery_address"] = self._normalize_delivery_address(raw_address)
            return attrs

        if isinstance(raw_payload.get("deliveryAddress"), dict):
            attrs["delivery_address"] = self._normalize_delivery_address(raw_payload["deliveryAddress"])
            return attrs

        # Backward-compatible fallback for clients that send flattened address fields.
        normalized = self._compose_address_from_parts(raw_payload)
        if normalized:
            attrs["delivery_address"] = normalized
            return attrs

        raise serializers.ValidationError({"delivery_address": self.error_messages["delivery_address_required"]})


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            Order.Status.CONFIRMED,
            Order.Status.SHIPPED,
            Order.Status.DELIVERED,
        ]
>>>>>>> Stashed changes
    )
