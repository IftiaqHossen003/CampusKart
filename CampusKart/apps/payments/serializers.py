from rest_framework import serializers
from .models import Payment, VendorPayout


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.UUIDField(source="order.order_number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "payment_id", "order_number", "gateway", "gateway_payment_id",
            "amount", "currency", "status", "idempotency_key", "created_at",
        ]
        read_only_fields = ["id", "payment_id", "created_at"]


class InitiatePaymentSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    gateway = serializers.ChoiceField(choices=Payment.Gateway.choices)
    idempotency_key = serializers.CharField(required=False, allow_blank=False, max_length=100)


class VendorPayoutSerializer(serializers.ModelSerializer):
    order_number = serializers.UUIDField(source="payment.order.order_number", read_only=True)
    vendor_name = serializers.CharField(source="vendor.shop_name", read_only=True)

    class Meta:
        model = VendorPayout
        fields = [
            "id",
            "order_number",
            "vendor_name",
            "gross_amount",
            "commission_amount",
            "net_amount",
            "status",
            "release_at",
            "paid_at",
            "payout_reference",
            "created_at",
        ]


class VendorPayoutMarkPaidSerializer(serializers.Serializer):
    payout_reference = serializers.CharField(required=False, allow_blank=True, max_length=200)
