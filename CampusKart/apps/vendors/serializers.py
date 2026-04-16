from rest_framework import serializers
from .models import VendorProfile


class VendorProfileSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    approved_by_email = serializers.EmailField(source="approved_by.email", read_only=True)

    class Meta:
        model = VendorProfile
        fields = [
            "id", "user_email", "shop_name", "shop_slug", "description",
            "logo_url", "banner_url", "contact_email", "contact_phone", "address",
            "status", "commission_rate", "total_earnings",
            "approved_by", "approved_by_email", "approved_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "shop_slug", "status", "approved_by", "approved_by_email",
            "approved_at", "total_earnings", "created_at", "updated_at",
        ]


class VendorSpotlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProfile
        fields = [
            "id",
            "shop_name",
            "shop_slug",
            "description",
            "logo_url",
            "banner_url",
            "total_earnings",
            "created_at",
        ]
        read_only_fields = fields
