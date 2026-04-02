"""
Product & Category ViewSets for CampusKart.

Caching strategy
----------------
- Category list  : Redis, 1 hour  (key: products:categories)
- Product list   : Redis, 5 min   (key: products:list:<md5 of query string>)
- Product detail : Redis, 10 min  (key: products:detail:<slug>)

Cache invalidation
------------------
post_save / post_delete signals on Product (see signals.py) clear the
relevant detail key and all list keys via delete_pattern.
"""

import hashlib

from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.auth_app.permissions import IsAdmin, IsVendor

from .filters import ProductFilter
from .models import Category, Product, ProductTag
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    ProductWriteSerializer,
)

# Cache TTLs (seconds)
_TTL_LIST     = 5 * 60       # 5 minutes
_TTL_DETAIL   = 10 * 60      # 10 minutes
_TTL_CATEGORY = 60 * 60      # 1 hour
_TTL_TAGS     = 5 * 60       # 5 minutes
_PREFIX       = "products"


def _list_cache_key(request) -> str:
    """Deterministic cache key derived from the full query string."""
    qs = request.META.get("QUERY_STRING", "")
    digest = hashlib.md5(qs.encode(), usedforsecurity=False).hexdigest()
    return f"{_PREFIX}:list:{digest}"


# ---------------------------------------------------------------------------
# CategoryViewSet
# ---------------------------------------------------------------------------

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/v1/products/categories/       — list all root categories (cached 1 hr)
    GET /api/v1/products/categories/{id}/  — single category with children
    """

    serializer_class   = CategorySerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        if self.action == "list":
            # Only root categories; children are prefetched and nested
            return (
                Category.objects
                .filter(is_active=True, parent__isnull=True)
                .prefetch_related("children")
            )
        return Category.objects.filter(is_active=True).prefetch_related("children")

    def list(self, request, *args, **kwargs):
        cache_key = f"{_PREFIX}:categories"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, _TTL_CATEGORY)
        return response

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        cache_key = f"{_PREFIX}:category:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, _TTL_CATEGORY)
        return response


# ---------------------------------------------------------------------------
# ProductViewSet
# ---------------------------------------------------------------------------

class ProductViewSet(viewsets.ModelViewSet):
    """
    GET    /api/v1/products/                  — list  (public, cached 5 min)
    GET    /api/v1/products/{slug}/            — detail (public, cached 10 min)
    POST   /api/v1/products/                  — create (IsVendor)
    PUT    /api/v1/products/{slug}/            — full update (IsVendor, own product)
    PATCH  /api/v1/products/{slug}/            — partial update (IsVendor, own product)
    DELETE /api/v1/products/{slug}/            — delete (IsVendor, own product)
    POST   /api/v1/products/{slug}/approve/    — approve / reject (IsAdmin)
    """

    lookup_field    = "slug"
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class  = ProductFilter
    search_fields    = ["name", "description", "tags__tag"]
    ordering_fields  = ["price", "discount_price", "total_sold", "avg_rating", "created_at"]
    ordering         = ["-created_at"]

    # ── serializer selection ──────────────────────────────────────────────────

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        return ProductSerializer

    # ── permissions ───────────────────────────────────────────────────────────

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsVendor()]
        if self.action == "approve":
            return [permissions.IsAuthenticated(), IsAdmin()]
        return [permissions.AllowAny()]

    # ── queryset ──────────────────────────────────────────────────────────────

    def get_queryset(self):
        qs = (
            Product.objects
            .select_related("vendor", "category", "approved_by")
            .prefetch_related("images", "tags")
        )

        # Access scope for list/retrieve:
        # - public: approved only
        # - admin: all products
        # - vendor: own products (all statuses)
        user = self.request.user
        if self.action in ("list", "retrieve"):
            if not user.is_authenticated:
                qs = qs.filter(status=Product.Status.APPROVED)
            elif user.role == "admin":
                pass
            elif user.role == "vendor" and hasattr(user, "vendor_profile"):
                qs = qs.filter(vendor=user.vendor_profile)
            else:
                qs = qs.filter(status=Product.Status.APPROVED)

        return qs

    # ── object-level ownership check ─────────────────────────────────────────

    def get_object(self):
        obj = super().get_object()
        if self.action in ("update", "partial_update", "destroy"):
            user = self.request.user
            is_admin = user.role == "admin"
            owns = (
                hasattr(user, "vendor_profile")
                and obj.vendor == user.vendor_profile
            )
            if not (is_admin or owns):
                raise PermissionDenied("You do not own this product.")
        return obj

    # ── list — cached 5 minutes ───────────────────────────────────────────────

    def list(self, request, *args, **kwargs):
        cache_key = _list_cache_key(request)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, _TTL_LIST)
        return response

    # ── retrieve — cached 10 minutes ─────────────────────────────────────────

    def retrieve(self, request, *args, **kwargs):
        slug = kwargs.get(self.lookup_field)
        cache_key = f"{_PREFIX}:detail:{slug}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, _TTL_DETAIL)
        return response

    # ── create — auto-attach vendor ───────────────────────────────────────────

    def perform_create(self, serializer):
        serializer.save(vendor=self.request.user.vendor_profile)

    # ── approve / reject — admin action ──────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, slug=None):
        """
        Body: { "action": "approve" | "reject" }
        """
        product  = self.get_object()
        decision = request.data.get("action", "")

        if decision == "approve":
            product.status      = Product.Status.APPROVED
            product.approved_by = request.user
            product.approved_at = timezone.now()
        elif decision == "reject":
            product.status      = Product.Status.REJECTED
            product.approved_by = request.user
            product.approved_at = timezone.now()
        else:
            return Response(
                {"detail": 'action must be \"approve\" or \"reject\".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product.save(update_fields=["status", "approved_by", "approved_at"])
        return Response(
            ProductSerializer(product, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="tags")
    def tags(self, request):
        """
        GET /api/v1/products/tags/
        Returns globally available approved product tags with usage counts.
        """
        cache_key = f"{_PREFIX}:tags"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        data = list(
            ProductTag.objects
            .filter(product__status=Product.Status.APPROVED)
            .values("tag")
            .annotate(count=Count("id"))
            .order_by("tag")
        )

        cache.set(cache_key, data, _TTL_TAGS)
        return Response(data)
