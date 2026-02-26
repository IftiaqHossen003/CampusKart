from rest_framework import serializers
from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id", "reviewer_username", "product", "vendor", "rating",
            "title", "body", "is_verified_purchase", "created_at",
        ]
        read_only_fields = ["id", "is_verified_purchase", "created_at"]

    def validate(self, attrs):
        if not attrs.get("product") and not attrs.get("vendor"):
            raise serializers.ValidationError("A review must target either a product or a vendor.")
        return attrs
