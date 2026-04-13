from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.orders.models import Order
from apps.payments.models import Payment, VendorPayout

from .services import invalidate_admin_stats_cache


@receiver([post_save, post_delete], sender=Order)
def invalidate_admin_stats_on_order_change(sender, instance, **kwargs):
    invalidate_admin_stats_cache()


@receiver([post_save, post_delete], sender=Payment)
def invalidate_admin_stats_on_payment_change(sender, instance, **kwargs):
    invalidate_admin_stats_cache()


@receiver([post_save, post_delete], sender=VendorPayout)
def invalidate_admin_stats_on_payout_change(sender, instance, **kwargs):
    invalidate_admin_stats_cache()
