from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db.models import Avg, Count, DecimalField, ExpressionWrapper, F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.orders.models import Order, OrderItem, VendorOrder
from apps.payments.models import VendorPayout
from apps.products.models import Product, ProductImage, ProductViewDaily
from apps.reviews.models import Review

_CACHE_PREFIX = "vendor:analytics:v1"
_CACHE_TTL_SECONDS = 15 * 60
_CACHE_REGISTRY_PREFIX = f"{_CACHE_PREFIX}:registry"

_PERIOD_TO_DAYS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1y": 365,
}

_PENDING_ORDER_STATUSES = (
    Order.Status.PENDING,
    Order.Status.CONFIRMED,
    Order.Status.SHIPPED,
    Order.Status.PARTIALLY_SHIPPED,
)


def _money_zero_value() -> Value:
    return Value(
        Decimal("0.00"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )


def _int_zero_value() -> Value:
    return Value(0, output_field=IntegerField())


def _cache_key(vendor_id: int, section: str, extra: str = "") -> str:
    suffix = f":{extra}" if extra else ""
    return f"{_CACHE_PREFIX}:{vendor_id}:{section}{suffix}"


def _month_windows(reference_dt):
    this_month_start = reference_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if this_month_start.month == 1:
        last_month_start = this_month_start.replace(
            year=this_month_start.year - 1,
            month=12,
        )
    else:
        last_month_start = this_month_start.replace(month=this_month_start.month - 1)
    return this_month_start, last_month_start, this_month_start


def _cache_get_safe(key: str):
    try:
        return cache.get(key)
    except Exception:
        return None


def _cache_set_safe(key: str, value) -> None:
    try:
        cache.set(key, value, _CACHE_TTL_SECONDS)
    except Exception:
        return


def _registry_key(vendor_id: int) -> str:
    return f"{_CACHE_REGISTRY_PREFIX}:{vendor_id}"


def _track_cache_key(vendor_id: int, key: str) -> None:
    registry_key = _registry_key(vendor_id)
    try:
        keys = cache.get(registry_key) or []
        if key not in keys:
            keys.append(key)
            cache.set(registry_key, keys, _CACHE_TTL_SECONDS * 12)
    except Exception:
        return


def invalidate_vendor_analytics_cache(vendor_id: int) -> None:
    if not vendor_id:
        return

    delete_pattern = getattr(cache, "delete_pattern", None)
    if callable(delete_pattern):
        try:
            delete_pattern(f"{_CACHE_PREFIX}:{vendor_id}:*")
            cache.delete(_registry_key(vendor_id))
            return
        except Exception:
            pass

    registry_key = _registry_key(vendor_id)
    try:
        keys = cache.get(registry_key) or []
        for cache_key in keys:
            cache.delete(cache_key)
        cache.delete(registry_key)
    except Exception:
        return


def get_vendor_overview(vendor_profile) -> dict:
    cache_key = _cache_key(vendor_profile.pk, "overview")
    cached = _cache_get_safe(cache_key)
    if cached is not None:
        return cached

    money_zero = _money_zero_value()

    delivered_vendor_orders = VendorOrder.objects.filter(
        vendor=vendor_profile,
        status=Order.Status.DELIVERED,
    )

    now = timezone.now()
    this_month_start, last_month_start, last_month_end = _month_windows(now)

    totals = delivered_vendor_orders.aggregate(
        total_revenue=Coalesce(Sum("net_vendor_amount"), money_zero),
        this_month_revenue=Coalesce(
            Sum("net_vendor_amount", filter=Q(created_at__gte=this_month_start)),
            money_zero,
        ),
        last_month_revenue=Coalesce(
            Sum(
                "net_vendor_amount",
                filter=Q(created_at__gte=last_month_start, created_at__lt=last_month_end),
            ),
            money_zero,
        ),
    )

    order_counts = VendorOrder.objects.filter(vendor=vendor_profile).aggregate(
        total_orders=Count("id"),
        pending_orders=Count("id", filter=Q(status__in=_PENDING_ORDER_STATUSES)),
        completed_orders=Count("id", filter=Q(status=Order.Status.DELIVERED)),
        this_month_orders=Count("id", filter=Q(created_at__gte=this_month_start)),
        last_month_orders=Count("id", filter=Q(created_at__gte=last_month_start, created_at__lt=last_month_end)),
    )

    product_counts = Product.objects.filter(vendor=vendor_profile).aggregate(
        total_products=Count("id"),
        approved_products=Count("id", filter=Q(status=Product.Status.APPROVED)),
        pending_products=Count("id", filter=Q(status=Product.Status.PENDING)),
    )

    line_revenue = ExpressionWrapper(
        F("unit_price") * F("quantity"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )

    top_product_row = (
        OrderItem.objects.filter(
            vendor_order__vendor=vendor_profile,
            vendor_order__status=Order.Status.DELIVERED,
            product__isnull=False,
        )
        .values("product__name")
        .annotate(
            total_sold=Coalesce(Sum("quantity"), _int_zero_value()),
            revenue=Coalesce(Sum(line_revenue), money_zero),
        )
        .order_by("-revenue", "-total_sold", "product__name")
        .first()
    )

    avg_rating = Product.objects.filter(vendor=vendor_profile).aggregate(
        value=Coalesce(
            Avg("avg_rating"),
            Value(
                Decimal("0.00"),
                output_field=DecimalField(max_digits=4, decimal_places=2),
            ),
        )
    )["value"]

    ratings = Review.objects.filter(
        product__vendor=vendor_profile,
        is_approved=True,
    ).aggregate(
        this_month_avg_rating=Coalesce(
            Avg(
                "rating",
                filter=Q(created_at__gte=this_month_start),
                output_field=DecimalField(max_digits=4, decimal_places=2),
            ),
            Value(
                Decimal("0.00"),
                output_field=DecimalField(max_digits=4, decimal_places=2),
            ),
        ),
        last_month_avg_rating=Coalesce(
            Avg(
                "rating",
                filter=Q(created_at__gte=last_month_start, created_at__lt=last_month_end),
                output_field=DecimalField(max_digits=4, decimal_places=2),
            ),
            Value(
                Decimal("0.00"),
                output_field=DecimalField(max_digits=4, decimal_places=2),
            ),
        ),
    )

    payouts = VendorPayout.objects.filter(vendor=vendor_profile).aggregate(
        pending_payout_amount=Coalesce(
            Sum("net_amount", filter=Q(status=VendorPayout.Status.PENDING)),
            money_zero,
        ),
        this_month_pending_payout=Coalesce(
            Sum(
                "net_amount",
                filter=Q(status=VendorPayout.Status.PENDING, created_at__gte=this_month_start),
            ),
            money_zero,
        ),
        last_month_pending_payout=Coalesce(
            Sum(
                "net_amount",
                filter=Q(
                    status=VendorPayout.Status.PENDING,
                    created_at__gte=last_month_start,
                    created_at__lt=last_month_end,
                ),
            ),
            money_zero,
        ),
    )

    payload = {
        "total_revenue": totals["total_revenue"],
        "this_month_revenue": totals["this_month_revenue"],
        "last_month_revenue": totals["last_month_revenue"],
        "this_month_orders": order_counts["this_month_orders"],
        "last_month_orders": order_counts["last_month_orders"],
        "this_month_avg_rating": ratings["this_month_avg_rating"],
        "last_month_avg_rating": ratings["last_month_avg_rating"],
        "pending_payout_amount": payouts["pending_payout_amount"],
        "this_month_pending_payout": payouts["this_month_pending_payout"],
        "last_month_pending_payout": payouts["last_month_pending_payout"],
        "total_orders": order_counts["total_orders"],
        "pending_orders": order_counts["pending_orders"],
        "completed_orders": order_counts["completed_orders"],
        "total_products": product_counts["total_products"],
        "approved_products": product_counts["approved_products"],
        "pending_products": product_counts["pending_products"],
        "top_product": (
            {
                "name": top_product_row["product__name"],
                "total_sold": top_product_row["total_sold"],
                "revenue": top_product_row["revenue"],
            }
            if top_product_row
            else None
        ),
        "avg_rating": avg_rating,
    }

    _track_cache_key(vendor_profile.pk, cache_key)
    _cache_set_safe(cache_key, payload)
    return payload


def get_vendor_revenue_series(vendor_profile, period: str) -> list[dict]:
    if period not in _PERIOD_TO_DAYS:
        raise ValueError("Invalid period")

    cache_key = _cache_key(vendor_profile.pk, "revenue", period)
    cached = _cache_get_safe(cache_key)
    if cached is not None:
        return cached

    money_zero = _money_zero_value()
    days = _PERIOD_TO_DAYS[period]
    today = timezone.localdate()
    start_date = today - timedelta(days=days - 1)

    grouped = (
        VendorOrder.objects.filter(
            vendor=vendor_profile,
            status=Order.Status.DELIVERED,
            created_at__date__gte=start_date,
            created_at__date__lte=today,
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            revenue=Coalesce(Sum("net_vendor_amount"), money_zero),
            orders=Count("id"),
        )
        .order_by("day")
    )

    grouped_map = {
        row["day"]: {
            "revenue": row["revenue"],
            "orders": row["orders"],
        }
        for row in grouped
    }

    series = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        row = grouped_map.get(day)
        if row is None:
            series.append({"date": day, "revenue": Decimal("0.00"), "orders": 0})
            continue
        series.append({"date": day, "revenue": row["revenue"], "orders": row["orders"]})

    _track_cache_key(vendor_profile.pk, cache_key)
    _cache_set_safe(cache_key, series)
    return series


def get_vendor_products_analytics(vendor_profile) -> list[dict]:
    cache_key = _cache_key(vendor_profile.pk, "products")
    cached = _cache_get_safe(cache_key)
    if cached is not None:
        return cached

    money_zero = _money_zero_value()
    line_revenue = ExpressionWrapper(
        F("unit_price") * F("quantity"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )

    revenue_rows = (
        OrderItem.objects.filter(
            vendor_order__vendor=vendor_profile,
            vendor_order__status=Order.Status.DELIVERED,
            product__isnull=False,
        )
        .values("product_id")
        .annotate(revenue=Coalesce(Sum(line_revenue), money_zero))
    )
    revenue_by_product = {row["product_id"]: row["revenue"] for row in revenue_rows}

    views_rows = (
        ProductViewDaily.objects.filter(product__vendor=vendor_profile)
        .values("product_id")
        .annotate(views=Coalesce(Sum("view_count"), _int_zero_value()))
    )
    views_by_product = {row["product_id"]: row["views"] for row in views_rows}

    primary_image_subquery = ProductImage.objects.filter(product_id=OuterRef("id")).order_by(
        "-is_primary",
        "sort_order",
        "id",
    )

    products = (
        Product.objects.filter(vendor=vendor_profile)
        .annotate(image_url=Subquery(primary_image_subquery.values("image_url")[:1]))
        .values(
            "id",
            "name",
            "image_url",
            "total_sold",
            "avg_rating",
        )
    )

    rows = []
    for product in products:
        product_id = product["id"]
        rows.append(
            {
                "name": product["name"],
                "image_url": product["image_url"] or "",
                "views": views_by_product.get(product_id, 0),
                "sold": int(product["total_sold"] or 0),
                "revenue": revenue_by_product.get(product_id, Decimal("0.00")),
                "rating": product["avg_rating"] or Decimal("0.00"),
            }
        )

    rows.sort(key=lambda item: (item["revenue"], item["sold"]), reverse=True)
    rows = rows[:10]

    _track_cache_key(vendor_profile.pk, cache_key)
    _cache_set_safe(cache_key, rows)
    return rows


def get_vendor_payouts_analytics(vendor_profile) -> dict:
    cache_key = _cache_key(vendor_profile.pk, "payouts")
    cached = _cache_get_safe(cache_key)
    if cached is not None:
        return cached

    money_zero = _money_zero_value()

    queryset = VendorPayout.objects.filter(vendor=vendor_profile).select_related("payment", "payment__order")

    payouts = [
        {
            "order_number": str(payout.payment.order.order_number),
            "gross": payout.gross_amount,
            "commission": payout.commission_amount,
            "commission_percentage": (
                (payout.commission_amount * Decimal("100.00") / payout.gross_amount).quantize(Decimal("0.01"))
                if payout.gross_amount
                else Decimal("0.00")
            ),
            "net": payout.net_amount,
            "status": payout.status,
            "date": payout.created_at,
        }
        for payout in queryset.order_by("-created_at")
    ]

    totals = queryset.aggregate(
        total_earned=Coalesce(Sum("gross_amount"), money_zero),
        total_commission_paid=Coalesce(Sum("commission_amount"), money_zero),
        total_net_received=Coalesce(
            Sum("net_amount", filter=Q(status=VendorPayout.Status.PAID)),
            money_zero,
        ),
        total_pending_amount=Coalesce(
            Sum("net_amount", filter=Q(status=VendorPayout.Status.PENDING)),
            money_zero,
        ),
    )

    payload = {
        "payouts": payouts,
        "total_earned": totals["total_earned"],
        "total_commission_paid": totals["total_commission_paid"],
        "total_net_received": totals["total_net_received"],
        "total_pending_amount": totals["total_pending_amount"],
        "total_pending_payout_amount": totals["total_pending_amount"],
    }

    _track_cache_key(vendor_profile.pk, cache_key)
    _cache_set_safe(cache_key, payload)
    return payload


def get_vendor_payouts_csv_rows(vendor_profile) -> list[list[object]]:
    queryset = VendorPayout.objects.filter(vendor=vendor_profile).select_related("payment", "payment__order")
    rows = []

    for payout in queryset.order_by("-created_at"):
        if payout.gross_amount:
            commission_percentage = (payout.commission_amount * Decimal("100.00") / payout.gross_amount).quantize(
                Decimal("0.01")
            )
        else:
            commission_percentage = Decimal("0.00")

        rows.append(
            [
                str(payout.payment.order.order_number),
                payout.created_at.isoformat(),
                payout.gross_amount,
                payout.commission_amount,
                commission_percentage,
                payout.net_amount,
                payout.status,
            ]
        )

    return rows
