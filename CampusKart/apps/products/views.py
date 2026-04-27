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
import logging
import uuid
from pathlib import Path

import cloudinary.uploader
from cloudinary.utils import cloudinary_url
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Count, F, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auth_app.permissions import IsAdmin, IsVendor
from apps.common.validators import validate_uploaded_image

from .filters import ProductFilter
from .models import Category, Product, ProductImage, ProductTag, ProductViewDaily
from .services import moderate_product_status
from .serializers import (
    CategorySerializer,
    ProductListSerializer,
    ProductSerializer,
    ProductWriteSerializer,
)
from .tasks import upload_product_image

# Cache TTLs (seconds)
_TTL_LIST     = 5 * 60       # 5 minutes
_TTL_DETAIL   = 10 * 60      # 10 minutes
_TTL_CATEGORY = 60 * 60      # 1 hour
_TTL_TAGS     = 5 * 60       # 5 minutes
_PREFIX       = "products"

logger = logging.getLogger(__name__)


def _cache_get_safe(key: str):
    try:
        return cache.get(key)
    except Exception:
        logger.warning("Cache get failed for key '%s'; serving uncached response.", key, exc_info=True)
        return None


def _cache_set_safe(key: str, value, timeout: int) -> None:
    try:
        cache.set(key, value, timeout)
    except Exception:
        logger.warning("Cache set failed for key '%s'; continuing without cache.", key, exc_info=True)


def _list_cache_key(request) -> str:
    """Deterministic cache key derived from viewer scope + full query string."""
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        if getattr(user, "role", "") == "admin":
            scope = "admin"
        elif getattr(user, "role", "") == "vendor" and hasattr(user, "vendor_profile"):
            scope = f"vendor:{user.vendor_profile.id}"
        else:
            scope = "authenticated"
    else:
        scope = "public"

    qs = request.META.get("QUERY_STRING", "")
    digest = hashlib.md5(f"{scope}:{qs}".encode(), usedforsecurity=False).hexdigest()
    return f"{_PREFIX}:list:{digest}"


def _detail_cache_key(request, *, slug: str) -> str:
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        if getattr(user, "role", "") == "admin":
            scope = "admin"
        elif getattr(user, "role", "") == "vendor" and hasattr(user, "vendor_profile"):
            scope = f"vendor:{user.vendor_profile.id}"
        else:
            scope = "authenticated"
    else:
        scope = "public"
    return f"{_PREFIX}:detail:{slug}:{scope}"


def _ensure_vendor_owns_product(user, product: Product) -> None:
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")
    if user.role == "admin":
        return
    if user.role != "vendor":
        raise PermissionDenied("Vendor role is required.")
    if not hasattr(user, "vendor_profile") or product.vendor_id != user.vendor_profile.id:
        raise PermissionDenied("You can only manage your own product images.")


def _track_product_view(product_id: int) -> None:
    if not product_id:
        return

    today = timezone.localdate()
    try:
        updated = ProductViewDaily.objects.filter(
            product_id=product_id,
            view_date=today,
        ).update(view_count=F("view_count") + 1)
        if updated:
            return

        ProductViewDaily.objects.create(
            product_id=product_id,
            view_date=today,
            view_count=1,
        )
    except IntegrityError:
        ProductViewDaily.objects.filter(
            product_id=product_id,
            view_date=today,
        ).update(view_count=F("view_count") + 1)
    except Exception:
        logger.warning("Product view tracking failed for product_id=%s", product_id, exc_info=True)


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

    def get_queryset(self) -> QuerySet[Category]:
        if self.action == "list":
            # Prefer root categories with nested children.
            # If no root exists, fall back to all active categories so UI still renders options.
            root_categories = Category.objects.filter(is_active=True, parent__isnull=True)
            if root_categories.exists():
                return root_categories.prefetch_related("children")
            return Category.objects.filter(is_active=True).prefetch_related("children")
        return Category.objects.filter(is_active=True).prefetch_related("children")

    def list(self, request, *args, **kwargs):
        cache_key = f"{_PREFIX}:categories:v2"
        cached = _cache_get_safe(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        _cache_set_safe(cache_key, response.data, _TTL_CATEGORY)
        return response

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        cache_key = f"{_PREFIX}:category:{pk}"
        cached = _cache_get_safe(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        _cache_set_safe(cache_key, response.data, _TTL_CATEGORY)
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
        if self.action == "list":
            return ProductListSerializer
        return ProductSerializer

    # ── permissions ───────────────────────────────────────────────────────────

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsVendor()]
        if self.action == "approve":
            return [permissions.IsAuthenticated(), IsAdmin()]
        return [permissions.AllowAny()]

    # ── queryset ──────────────────────────────────────────────────────────────

    def get_queryset(self) -> QuerySet[Product]:
        qs = Product.objects.select_related("vendor", "category", "approved_by")
        if self.action == "list":
            qs = qs.prefetch_related("images")
        else:
            qs = qs.prefetch_related("images", "tags")

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
        cached = _cache_get_safe(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        _cache_set_safe(cache_key, response.data, _TTL_LIST)
        return response

    # ── retrieve — cached 10 minutes ─────────────────────────────────────────

    def retrieve(self, request, *args, **kwargs):
        slug = kwargs.get(self.lookup_field)
        cache_key = _detail_cache_key(request, slug=slug)
        cached = _cache_get_safe(cache_key)
        if cached is not None:
            product_id = cached.get("id") if isinstance(cached, dict) else None
            if isinstance(product_id, int):
                _track_product_view(product_id)
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        product_id = response.data.get("id") if isinstance(response.data, dict) else None
        if isinstance(product_id, int):
            _track_product_view(product_id)
        _cache_set_safe(cache_key, response.data, _TTL_DETAIL)
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
            moderate_product_status(
                product=product,
                actor=request.user,
                target_status=Product.Status.APPROVED,
            )
        elif decision == "reject":
            moderate_product_status(
                product=product,
                actor=request.user,
                target_status=Product.Status.REJECTED,
            )
        else:
            return Response(
                {"detail": 'action must be \"approve\" or \"reject\".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
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
        cached = _cache_get_safe(cache_key)
        if cached is not None:
            return Response(cached)

        data = list(
            ProductTag.objects
            .filter(product__status=Product.Status.APPROVED)
            .values("tag")
            .annotate(count=Count("id"))
            .order_by("tag")
        )

        _cache_set_safe(cache_key, data, _TTL_TAGS)
        return Response(data)


class ProductImageUploadView(APIView):
    """
    POST /api/v1/products/{id}/images/

    Accepts multipart file upload, validates type+size,
    queues async Cloudinary upload, and returns 202.
    """

    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def post(self, request, id: int):
        product = get_object_or_404(Product.objects.select_related("vendor"), pk=id)
        _ensure_vendor_owns_product(request.user, product)

        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"detail": "image file is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_uploaded_image(image_file, field_name="image")
            suffix = Path(image_file.name).suffix.lower()
        except DjangoValidationError as exc:
            message = exc.message_dict.get("image", ["Invalid image upload."])[0]
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        # Create predictable Cloudinary public ID so we can return display URL immediately.
        public_id = f"product-{product.id}-{uuid.uuid4().hex}"

        # Placeholder DB row so UI can reference image_id before async upload finishes.
        placeholder = ProductImage.objects.create(
            product=product,
            cloudinary_public_id=public_id,
            image_url="",
        )

        shared_tmp_dir = Path(settings.BASE_DIR) / ".tmp_uploads" / "product_uploads"
        shared_tmp_dir.mkdir(parents=True, exist_ok=True)
        abs_path = str((shared_tmp_dir / f"{public_id}{suffix}").resolve())

        with open(abs_path, "wb") as dst:
            for chunk in image_file.chunks():
                dst.write(chunk)

        async_result = upload_product_image.delay(abs_path, product.id, public_id, placeholder.id)

        presigned_url, _ = cloudinary_url(
            f"campuskart/products/{public_id}",
            secure=True,
            sign_url=True,
            transformation=[{"width": 800, "crop": "limit"}],
        )

        return Response(
            {
                "detail": "Image upload queued.",
                "task_id": async_result.id,
                "product_id": product.id,
                "image_id": placeholder.id,
                "presigned_url": presigned_url,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class ProductImageDeleteView(APIView):
    """
    DELETE /api/v1/products/{id}/images/{image_id}/
    """

    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def delete(self, request, id: int, image_id: int):
        product = get_object_or_404(Product.objects.select_related("vendor"), pk=id)
        _ensure_vendor_owns_product(request.user, product)

        image = get_object_or_404(ProductImage, pk=image_id, product_id=product.id)

        if image.cloudinary_public_id:
            try:
                cloudinary.uploader.destroy(
                    image.cloudinary_public_id,
                    resource_type="image",
                    invalidate=True,
                )
            except Exception:
                # Do not block DB cleanup when Cloudinary delete fails.
                pass

        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)