from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.orders.models import VendorOrder
from apps.payments.models import VendorPayout
from apps.products.models import Product, ProductViewDaily

from .analytics_services import invalidate_vendor_analytics_cache


def _invalidate_from_vendor(instance) -> None:
    vendor_id = getattr(instance, "vendor_id", None)
    if vendor_id:
        invalidate_vendor_analytics_cache(vendor_id)


@receiver([post_save, post_delete], sender=VendorOrder)
def invalidate_vendor_analytics_on_vendor_order_change(sender, instance, **kwargs):
    _invalidate_from_vendor(instance)


@receiver([post_save, post_delete], sender=VendorPayout)
def invalidate_vendor_analytics_on_payout_change(sender, instance, **kwargs):
    _invalidate_from_vendor(instance)


@receiver([post_save, post_delete], sender=Product)
def invalidate_vendor_analytics_on_product_change(sender, instance, **kwargs):
    _invalidate_from_vendor(instance)


@receiver([post_save, post_delete], sender=ProductViewDaily)
def invalidate_vendor_analytics_on_product_view_change(sender, instance, **kwargs):
    vendor_id = getattr(instance.product, "vendor_id", None)
    if vendor_id:
        invalidate_vendor_analytics_cache(vendor_id)
