from rest_framework import serializers
from apps.orders.models import Order, OrderItem
from .models import Review


class ProductReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all())

    class Meta:
        model = Review
        fields = [
            "id", "user", "user_name", "product", "order", "rating",
            "comment", "is_approved", "created_at",
        ]
        read_only_fields = ["id", "user", "product", "is_approved", "created_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        product = self.context.get("product")
        order = attrs.get("order")

        if request is None or request.user.is_anonymous:
            raise serializers.ValidationError("Authentication is required.")

        if product is None:
            raise serializers.ValidationError("Product context is required.")

        if order is None:
            raise serializers.ValidationError({"order": "Order is required."})

        if order.buyer_id != request.user.id:
            raise serializers.ValidationError({"order": "Order does not belong to you."})

        if order.status != Order.Status.DELIVERED:
            raise serializers.ValidationError({"order": "Only delivered orders can be reviewed."})

        has_ordered_product = OrderItem.objects.filter(
            order=order,
            product_id=product.id,
        ).exists()
        if not has_ordered_product:
            raise serializers.ValidationError({"order": "This order does not include the selected product."})

        existing = Review.objects.filter(
            user=request.user,
            product=product,
            order=order,
        )
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)

        if existing.exists():
            raise serializers.ValidationError("You have already reviewed this product for this order.")

        return attrs
