"""
Django-filter FilterSet for Product.
Supports: category id, tag (exact/icontains), price range, status.
"""

import django_filters

from .models import Product


class ProductFilter(django_filters.FilterSet):
    # Filter by category primary key or slug
    category      = django_filters.NumberFilter(field_name="category__id")
    category_slug = django_filters.CharFilter(field_name="category__slug", lookup_expr="exact")

    # Tag exact-match (case-insensitive); supports multiple values via repeated param
    tag = django_filters.CharFilter(field_name="tags__tag", lookup_expr="iexact")

    # Price range
    min_price = django_filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price", lookup_expr="lte")

    # Status
    status = django_filters.ChoiceFilter(choices=Product.Status.choices)

    # Vendor
    vendor = django_filters.NumberFilter(field_name="vendor__id")

    class Meta:
        model  = Product
        fields = ["category", "category_slug", "tag", "min_price", "max_price", "status", "vendor"]
