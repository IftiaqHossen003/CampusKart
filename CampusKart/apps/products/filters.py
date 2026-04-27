"""
Django-filter FilterSet for Product.
Supports: category id, tag (exact/icontains), price range, status.
"""

from decimal import Decimal, InvalidOperation

import django_filters

from .models import Product


class ProductFilter(django_filters.FilterSet):
    # Filter by category primary key or slug
    category      = django_filters.NumberFilter(field_name="category__id")
    category_slug = django_filters.CharFilter(field_name="category__slug", lookup_expr="exact")

    # Tag exact-match (case-insensitive); supports multiple values via repeated param
    tag = django_filters.CharFilter(field_name="tags__tag", lookup_expr="iexact")

    # Price range (accept invalid values gracefully so APIs do not 400 on bad clients)
    min_price = django_filters.CharFilter(method="filter_min_price")
    max_price = django_filters.CharFilter(method="filter_max_price")

    # Status
    status = django_filters.ChoiceFilter(choices=Product.Status.choices)

    # Vendor
    vendor = django_filters.NumberFilter(field_name="vendor__id")

    class Meta:
        model  = Product
        fields = ["category", "category_slug", "tag", "min_price", "max_price", "status", "vendor"]

    @staticmethod
    def _parse_decimal(value):
        if value is None:
            return None

        text = str(value).strip().lower()
        if not text or text in {"undefined", "null"}:
            return None

        try:
            return Decimal(text)
        except (InvalidOperation, ValueError, TypeError):
            return None

    def filter_min_price(self, queryset, name, value):
        parsed = self._parse_decimal(value)
        if parsed is None:
            return queryset
        return queryset.filter(price__gte=parsed)

    def filter_max_price(self, queryset, name, value):
        parsed = self._parse_decimal(value)
        if parsed is None:
            return queryset
        return queryset.filter(price__lte=parsed)
