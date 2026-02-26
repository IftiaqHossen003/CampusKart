from rest_framework import serializers
from .models import VendorProfile


class VendorProfileSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = VendorProfile
        fields = [
            "id", "user_email", "shop_name", "description", "logo", "banner",
            "college", "status", "total_sales", "is_featured", "created_at",
        ]
        read_only_fields = ["id", "status", "total_sales", "created_at"]
