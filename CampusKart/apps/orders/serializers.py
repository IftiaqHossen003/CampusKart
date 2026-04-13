from rest_framework import serializers
from .models import DomainEvent, Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "unit_price", "subtotal"]


class OrderSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    buyer_email = serializers.EmailField(source="buyer.email", read_only=True)
    request_id = serializers.CharField(source="checkout_request_id", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "buyer_email", "status", "payment_method", "request_id", "total_amount",
            "delivery_address", "notes", "items", "created_at",
        ]
        read_only_fields = ["id", "order_number", "total_amount", "created_at"]

    def get_items(self, obj):
        items = obj.items.all()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user is not None and getattr(user, "role", "") == "vendor":
            vendor_profile = getattr(user, "vendor_profile", None)
            if vendor_profile is None:
                items = items.none()
            else:
                items = items.filter(product__vendor=vendor_profile)

        return OrderItemSerializer(items, many=True, context=self.context).data


class CreateOrderSerializer(serializers.Serializer):
    delivery_address = serializers.JSONField(required=False)
    deliveryAddress = serializers.JSONField(required=False, write_only=True)
    request_id = serializers.CharField(required=False, allow_blank=True, max_length=100, write_only=True)
    requestId = serializers.CharField(required=False, allow_blank=True, max_length=100, write_only=True)
    payment_method = serializers.CharField(required=False, allow_blank=True, write_only=True)
    paymentMethod = serializers.CharField(required=False, allow_blank=True, write_only=True)
    full_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    address_line = serializers.CharField(required=False, allow_blank=True, write_only=True)
    area_city = serializers.CharField(required=False, allow_blank=True, write_only=True)
    items = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    default_error_messages = {
        "delivery_address_required": "Delivery address is required.",
        "delivery_address_invalid": "Delivery address must be a non-empty string or an object.",
        "request_id_invalid": "request_id must be a non-empty string when provided.",
        "payment_method_invalid": "payment_method must be either 'cod' or 'sslcommerz'.",
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

        raw_payment_method = (
            attrs.get("payment_method")
            or attrs.get("paymentMethod")
            or raw_payload.get("payment_method")
            or raw_payload.get("paymentMethod")
            or Order.PaymentMethod.COD
        )
        normalized_method = str(raw_payment_method).strip().lower()
        if normalized_method in {"ssl", "ssl_commerz"}:
            normalized_method = Order.PaymentMethod.SSLCOMMERZ

        if normalized_method not in {
            Order.PaymentMethod.COD,
            Order.PaymentMethod.SSLCOMMERZ,
        }:
            self.fail("payment_method_invalid")

        attrs["payment_method"] = normalized_method

        raw_request_id = (
            attrs.get("request_id")
            or attrs.get("requestId")
            or raw_payload.get("request_id")
            or raw_payload.get("requestId")
        )
        if raw_request_id is not None:
            normalized_request_id = str(raw_request_id).strip()
            if not normalized_request_id:
                self.fail("request_id_invalid")
            attrs["request_id"] = normalized_request_id

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


class DomainEventSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source="order.id", read_only=True)
    vendor_order_id = serializers.IntegerField(source="vendor_order.id", read_only=True)

    class Meta:
        model = DomainEvent
        fields = [
            "id",
            "event_type",
            "idempotency_key",
            "order_id",
            "vendor_order_id",
            "status",
            "retry_count",
            "error_message",
            "processed_at",
            "created_at",
            "updated_at",
            "payload",
        ]


class DomainEventRetrySerializer(serializers.Serializer):
    force_reset = serializers.BooleanField(required=False, default=True)
