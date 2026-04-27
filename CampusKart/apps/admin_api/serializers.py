from django.utils.text import slugify
from rest_framework import serializers
import cloudinary.uploader
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.common.validators import validate_uploaded_image
from apps.orders.models import Order
from apps.products.models import Category, Product, ProductImage
from apps.vendors.models import VendorProfile

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
    total_users = serializers.IntegerField()
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
    admin_profit = serializers.DecimalField(max_digits=14, decimal_places=2)

    generated_at = serializers.DateTimeField()


class AdminRevenueTimeseriesQuerySerializer(serializers.Serializer):
    days = serializers.IntegerField(required=False, min_value=1, max_value=90, default=30)


class AdminRevenuePointSerializer(serializers.Serializer):
    date = serializers.DateField()
    collected_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


class AdminRecentOrdersQuerySerializer(serializers.Serializer):
    limit = serializers.IntegerField(required=False, min_value=1, max_value=100, default=10)


class AdminRecentOrderSerializer(serializers.ModelSerializer):
    buyer_email = serializers.EmailField(source="buyer.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "buyer_email",
            "status",
            "payment_method",
            "total_amount",
            "created_at",
        ]
        read_only_fields = fields


class AdminVendorQueueSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)
    approved_by_email = serializers.EmailField(source="approved_by.email", read_only=True)

    class Meta:
        model = VendorProfile
        fields = [
            "id",
            "shop_name",
            "shop_slug",
            "description",
            "logo_url",
            "banner_url",
            "contact_email",
            "contact_phone",
            "address",
            "status",
            "commission_rate",
            "total_earnings",
            "user_email",
            "user_full_name",
            "approved_by",
            "approved_by_email",
            "approved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminProductQueueImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image_url", "is_primary", "sort_order"]
        read_only_fields = fields


class AdminProductQueueSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.shop_name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    images = AdminProductQueueImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "vendor",
            "vendor_name",
            "category",
            "category_name",
            "price",
            "discount_price",
            "stock",
            "status",
            "approved_by",
            "approved_at",
            "total_sold",
            "avg_rating",
            "images",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminVendorModerationSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminProductModerationSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminBannerSerializer(serializers.ModelSerializer):
    image_file = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = Banner
        fields = [
            "id",
            "title",
            "image_url",
            "image_file",
            "link",
            "position",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "image_url": {"required": False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        image_file = attrs.get("image_file")
        image_url = attrs.get("image_url")
        if self.instance is None and not image_file and not image_url:
            raise serializers.ValidationError(
                {"image_file": "Provide an image file or image_url."}
            )
        return attrs

    def validate_image_file(self, value):
        try:
            validate_uploaded_image(value, field_name="image_file")
        except DjangoValidationError as exc:
            message = exc.message_dict.get("image_file", ["Invalid banner image upload."])[0]
            raise serializers.ValidationError(message) from exc
        return value

    def _upload_banner_image(self, image_file):
        upload_result = cloudinary.uploader.upload(
            image_file,
            folder="campuskart/banners",
            resource_type="image",
        )
        secure_url = upload_result.get("secure_url") or upload_result.get("url")
        if not secure_url:
            raise serializers.ValidationError({"image_file": "Could not upload banner image."})
        return str(secure_url)

    def create(self, validated_data):
        image_file = validated_data.pop("image_file", None)
        if image_file is not None:
            validated_data["image_url"] = self._upload_banner_image(image_file)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        image_file = validated_data.pop("image_file", None)
        if image_file is not None:
            validated_data["image_url"] = self._upload_banner_image(image_file)
        return super().update(instance, validated_data)


class PublicBannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = [
            "id",
            "title",
            "image_url",
            "link",
            "position",
        ]
        read_only_fields = fields


class AdminBannerReorderSerializer(serializers.Serializer):
    items = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    def validate_items(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Banner IDs in items must be unique.")
        return value


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
