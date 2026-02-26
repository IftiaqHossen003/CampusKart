from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.UUIDField(source="order.order_number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "payment_id", "order_number", "gateway", "gateway_payment_id",
            "amount", "currency", "status", "created_at",
        ]
        read_only_fields = ["id", "payment_id", "created_at"]


class InitiatePaymentSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    gateway = serializers.ChoiceField(choices=Payment.Gateway.choices)
