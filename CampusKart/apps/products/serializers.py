from django.utils.text import slugify
from rest_framework import serializers

from .models import Category, Product, ProductImage, ProductTag


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class ChildCategorySerializer(serializers.ModelSerializer):
    """Flat representation used as the nested children list inside CategorySerializer."""

    class Meta:
        model  = Category
        fields = ["id", "name", "slug", "icon_url", "is_active"]


class CategorySerializer(serializers.ModelSerializer):
    """Root category with one level of nested subcategories."""

    children = ChildCategorySerializer(many=True, read_only=True)

    class Meta:
        model  = Category
        fields = ["id", "name", "slug", "parent", "icon_url", "is_active", "children", "created_at"]
        read_only_fields = ["id", "created_at"]


# ---------------------------------------------------------------------------
# Product — shared sub-serializers
# ---------------------------------------------------------------------------

class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductImage
        fields = ["id", "cloudinary_public_id", "image_url", "is_primary", "sort_order"]
        read_only_fields = ["id", "cloudinary_public_id"]


class ProductTagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductTag
        fields = ["id", "tag"]


# ---------------------------------------------------------------------------
# Product — read (list / retrieve / approve response)
# ---------------------------------------------------------------------------

class ProductSerializer(serializers.ModelSerializer):
    images        = ProductImageSerializer(many=True, read_only=True)
    tags          = ProductTagSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    vendor_name   = serializers.CharField(source="vendor.shop_name", read_only=True)

    class Meta:
        model  = Product
        fields = [
            "id", "vendor_name", "category", "category_name", "name", "slug",
            "description", "price", "discount_price", "stock", "sku", "status",
            "approved_by", "approved_at", "total_sold", "avg_rating",
            "images", "tags", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "slug", "vendor_name", "category_name", "approved_by",
            "approved_at", "total_sold", "avg_rating", "created_at", "updated_at",
        ]


# ---------------------------------------------------------------------------
# Product — write (create / update by vendor)
# ---------------------------------------------------------------------------

class ProductWriteSerializer(serializers.ModelSerializer):
    """
    Accepts only the fields a vendor may supply.
    slug is auto-generated from name; vendor/status/approval fields are
    set programmatically by the view.
    """

    class Meta:
        model  = Product
        fields = [
            "name", "category", "description",
            "price", "discount_price", "stock", "sku",
        ]

    # ── slug helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _unique_slug(name: str, exclude_pk: int | None = None) -> str:
        base = slugify(name)
        slug = base
        counter = 1
        qs = Product.objects.all()
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        while qs.filter(slug=slug).exists():
            slug = f"{base}-{counter}"
            counter += 1
        return slug

    def create(self, validated_data):
        validated_data["slug"] = self._unique_slug(validated_data["name"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "name" in validated_data and validated_data["name"] != instance.name:
            validated_data["slug"] = self._unique_slug(
                validated_data["name"], exclude_pk=instance.pk
            )
        return super().update(instance, validated_data)
