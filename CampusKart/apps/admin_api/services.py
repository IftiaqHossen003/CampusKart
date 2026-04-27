from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, DecimalField, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.orders.models import Order
from apps.payments.models import Payment, VendorPayout
from apps.products.models import Product
from apps.vendors.models import VendorProfile

from .models import AdminAuditLog

_STATS_PREFIX = "admin:stats:v1"
_STATS_REGISTRY_KEY = f"{_STATS_PREFIX}:registry"
_STATS_TTL_SECONDS = 600
PUBLIC_BANNER_CACHE_PREFIX = "admin:banners:v1:public"
_PUBLIC_BANNER_REGISTRY_KEY = f"{PUBLIC_BANNER_CACHE_PREFIX}:registry"
PUBLIC_BANNER_CACHE_TTL_SECONDS = 60 * 60


def _stats_key(*, from_date: date | None, to_date: date | None) -> str:
    from_part = from_date.isoformat() if from_date else ""
    to_part = to_date.isoformat() if to_date else ""
    return f"{_STATS_PREFIX}:{from_part}:{to_part}"


def _track_stats_key(cache_key: str) -> None:
    keys = cache.get(_STATS_REGISTRY_KEY) or []
    if cache_key not in keys:
        keys.append(cache_key)
        cache.set(_STATS_REGISTRY_KEY, keys, _STATS_TTL_SECONDS * 12)


def _apply_date_range(queryset, *, from_date: date | None, to_date: date | None):
    if from_date:
        queryset = queryset.filter(created_at__date__gte=from_date)
    if to_date:
        queryset = queryset.filter(created_at__date__lte=to_date)
    return queryset


def build_admin_stats(*, from_date: date | None = None, to_date: date | None = None) -> dict:
    decimal_zero = Value(Decimal("0.00"), output_field=DecimalField(max_digits=14, decimal_places=2))
    int_zero = Value(0, output_field=IntegerField())
    user_model = get_user_model()

    user_qs = _apply_date_range(user_model.objects.all(), from_date=from_date, to_date=to_date)
    order_qs = _apply_date_range(Order.objects.all(), from_date=from_date, to_date=to_date)
    user_stats = user_qs.aggregate(
        total_users=Count("id"),
    )

    payment_qs = _apply_date_range(Payment.objects.all(), from_date=from_date, to_date=to_date)
    vendor_qs = _apply_date_range(VendorProfile.objects.all(), from_date=from_date, to_date=to_date)
    product_qs = _apply_date_range(Product.objects.all(), from_date=from_date, to_date=to_date)
    payout_qs = _apply_date_range(VendorPayout.objects.all(), from_date=from_date, to_date=to_date)

    order_stats = order_qs.aggregate(
        total_orders=Count("id"),
        pending_orders=Count("id", filter=Q(status=Order.Status.PENDING)),
        confirmed_orders=Count("id", filter=Q(status=Order.Status.CONFIRMED)),
        shipped_orders=Count("id", filter=Q(status=Order.Status.SHIPPED)),
        partially_shipped_orders=Count("id", filter=Q(status=Order.Status.PARTIALLY_SHIPPED)),
        delivered_orders=Count("id", filter=Q(status=Order.Status.DELIVERED)),
        cancelled_orders=Count("id", filter=Q(status=Order.Status.CANCELLED)),
        refunded_orders=Count("id", filter=Q(status=Order.Status.REFUNDED)),
        gross_order_value=Coalesce(Sum("total_amount"), decimal_zero),
    )

    payment_stats = payment_qs.aggregate(
        total_payments=Count("id"),
        initiated_payments=Count("id", filter=Q(status=Payment.Status.INITIATED)),
        pending_payments=Count("id", filter=Q(status=Payment.Status.PENDING)),
        successful_payments=Count("id", filter=Q(status=Payment.Status.SUCCESS)),
        failed_payments=Count("id", filter=Q(status=Payment.Status.FAILED)),
        refunded_payments=Count("id", filter=Q(status=Payment.Status.REFUNDED)),
        collected_revenue=Coalesce(Sum("amount", filter=Q(status=Payment.Status.SUCCESS)), decimal_zero),
        pending_cod_collection=Coalesce(
            Sum("amount", filter=Q(gateway=Payment.Gateway.COD, status=Payment.Status.PENDING)),
            decimal_zero,
        ),
    )

    vendor_stats = vendor_qs.aggregate(
        total_vendors=Count("id"),
        approved_vendors=Count("id", filter=Q(status=VendorProfile.Status.APPROVED)),
        pending_vendors=Count("id", filter=Q(status=VendorProfile.Status.PENDING)),
        suspended_vendors=Count("id", filter=Q(status=VendorProfile.Status.SUSPENDED)),
        total_vendor_earnings=Coalesce(Sum("total_earnings"), decimal_zero),
    )

    product_stats = product_qs.aggregate(
        total_products=Count("id"),
        approved_products=Count("id", filter=Q(status=Product.Status.APPROVED)),
        pending_products=Count("id", filter=Q(status=Product.Status.PENDING)),
        rejected_products=Count("id", filter=Q(status=Product.Status.REJECTED)),
        total_units_sold=Coalesce(Sum("total_sold"), int_zero),
    )

    payout_stats = payout_qs.aggregate(
        total_payouts=Count("id"),
        pending_payouts=Count("id", filter=Q(status=VendorPayout.Status.PENDING)),
        ready_payouts=Count("id", filter=Q(status=VendorPayout.Status.READY)),
        paid_payouts=Count("id", filter=Q(status=VendorPayout.Status.PAID)),
        failed_payouts=Count("id", filter=Q(status=VendorPayout.Status.FAILED)),
        cancelled_payouts=Count("id", filter=Q(status=VendorPayout.Status.CANCELLED)),
        total_paid_out=Coalesce(Sum("net_amount", filter=Q(status=VendorPayout.Status.PAID)), decimal_zero),
    )

    admin_profit = (payment_stats["collected_revenue"] or Decimal("0.00")) - (
        payout_stats["total_paid_out"] or Decimal("0.00")
    )

    return {
        **user_stats,
        **order_stats,
        **payment_stats,
        **vendor_stats,
        **product_stats,
        **payout_stats,
        "admin_profit": admin_profit,
        "generated_at": timezone.now(),
    }


def get_cached_admin_stats(*, from_date: date | None = None, to_date: date | None = None) -> dict:
    cache_key = _stats_key(from_date=from_date, to_date=to_date)
    cached_value = cache.get(cache_key)
    if cached_value is not None:
        return cached_value

    stats = build_admin_stats(from_date=from_date, to_date=to_date)
    cache.set(cache_key, stats, _STATS_TTL_SECONDS)
    _track_stats_key(cache_key)
    return stats


def invalidate_admin_stats_cache() -> None:
    delete_pattern = getattr(cache, "delete_pattern", None)
    if callable(delete_pattern):
        delete_pattern(f"{_STATS_PREFIX}:*")
        cache.delete(_STATS_REGISTRY_KEY)
        return

    keys = cache.get(_STATS_REGISTRY_KEY) or []
    for cache_key in keys:
        cache.delete(cache_key)
    cache.delete(_STATS_REGISTRY_KEY)


def invalidate_public_banner_cache() -> None:
    delete_pattern = getattr(cache, "delete_pattern", None)
    if callable(delete_pattern):
        delete_pattern(f"{PUBLIC_BANNER_CACHE_PREFIX}:*")
        cache.delete(_PUBLIC_BANNER_REGISTRY_KEY)
        return

    keys = cache.get(_PUBLIC_BANNER_REGISTRY_KEY) or []
    for cache_key in keys:
        cache.delete(cache_key)
    cache.delete(_PUBLIC_BANNER_REGISTRY_KEY)


def public_banner_cache_key(*, query_string: str) -> str:
    suffix = query_string or "default"
    return f"{PUBLIC_BANNER_CACHE_PREFIX}:{suffix}"


def track_public_banner_cache_key(cache_key: str) -> None:
    keys = cache.get(_PUBLIC_BANNER_REGISTRY_KEY) or []
    if cache_key not in keys:
        keys.append(cache_key)
        cache.set(_PUBLIC_BANNER_REGISTRY_KEY, keys, PUBLIC_BANNER_CACHE_TTL_SECONDS * 12)


def write_admin_audit_log(
    *,
    actor,
    action: str,
    resource_type: str,
    resource_id: str = "",
    request_method: str = "",
    request_path: str = "",
    before: dict | None = None,
    after: dict | None = None,
    metadata: dict | None = None,
) -> AdminAuditLog:
    return AdminAuditLog.objects.create(
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id or ""),
        request_method=request_method,
        request_path=request_path,
        before=before or {},
        after=after or {},
        metadata=metadata or {},
    )
