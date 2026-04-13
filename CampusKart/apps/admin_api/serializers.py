from django.utils.text import slugify
from rest_framework import serializers

from apps.products.models import Category, Product

from .models import AdminAuditLog, Banner


class AdminStatsQuerySerializer(serializers.Serializer):
    from_date = serializers.DateField(required=False)
    to_date = serializers.DateField(required=False)

    def validate(self, attrs):
        from_date = attrs.get("from_date")
        to_date = attrs.get("to_date")

        if from_date and to_date and from_date > to_date:
            raise serializers.ValidationError({"to_date": "to_date must be greater than or equal to from_date."})

        return attrs


class AdminStatsSerializer(serializers.Serializer):
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    confirmed_orders = serializers.IntegerField()
    shipped_orders = serializers.IntegerField()
    partially_shipped_orders = serializers.IntegerField()
    delivered_orders = serializers.IntegerField()
    cancelled_orders = serializers.IntegerField()
    refunded_orders = serializers.IntegerField()
    gross_order_value = serializers.DecimalField(max_digits=14, decimal_places=2)

    total_payments = serializers.IntegerField()
    initiated_payments = serializers.IntegerField()
    pending_payments = serializers.IntegerField()
    successful_payments = serializers.IntegerField()
    failed_payments = serializers.IntegerField()
    refunded_payments = serializers.IntegerField()
    collected_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    pending_cod_collection = serializers.DecimalField(max_digits=14, decimal_places=2)

    total_vendors = serializers.IntegerField()
    approved_vendors = serializers.IntegerField()
    pending_vendors = serializers.IntegerField()
    suspended_vendors = serializers.IntegerField()
    total_vendor_earnings = serializers.DecimalField(max_digits=14, decimal_places=2)

    total_products = serializers.IntegerField()
    approved_products = serializers.IntegerField()
    pending_products = serializers.IntegerField()
    rejected_products = serializers.IntegerField()
    total_units_sold = serializers.IntegerField()

    total_payouts = serializers.IntegerField()
    pending_payouts = serializers.IntegerField()
    ready_payouts = serializers.IntegerField()
    paid_payouts = serializers.IntegerField()
    failed_payouts = serializers.IntegerField()
    cancelled_payouts = serializers.IntegerField()
    total_paid_out = serializers.DecimalField(max_digits=14, decimal_places=2)

    generated_at = serializers.DateTimeField()


class AdminVendorModerationSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminProductModerationSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminBannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = [
            "id",
            "title",
            "image_url",
            "link",
            "position",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AdminCategorySerializer(serializers.ModelSerializer):
    slug = serializers.CharField(required=False)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "icon_url", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def _generate_unique_slug(self, base_text: str, *, exclude_pk: int | None = None) -> str:
        base = slugify(base_text) or "category"
        slug = base
        counter = 1

        queryset = Category.objects.all()
        if exclude_pk:
            queryset = queryset.exclude(pk=exclude_pk)

        while queryset.filter(slug=slug).exists():
            slug = f"{base}-{counter}"
            counter += 1

        return slug

    def create(self, validated_data):
        if not validated_data.get("slug"):
            validated_data["slug"] = self._generate_unique_slug(validated_data.get("name", "category"))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "slug" in validated_data and not validated_data["slug"]:
            raise serializers.ValidationError({"slug": "Slug cannot be blank."})

        if "slug" not in validated_data and "name" in validated_data and validated_data["name"] != instance.name:
            validated_data["slug"] = self._generate_unique_slug(validated_data["name"], exclude_pk=instance.pk)

        return super().update(instance, validated_data)


class AdminAuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AdminAuditLog
        fields = [
            "id",
            "action",
            "resource_type",
            "resource_id",
            "request_method",
            "request_path",
            "before",
            "after",
            "metadata",
            "actor",
            "actor_email",
            "created_at",
        ]
        read_only_fields = fields
