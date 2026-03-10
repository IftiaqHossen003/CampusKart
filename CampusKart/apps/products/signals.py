"""
Signal handlers for the products app.
Invalidates Redis cache entries whenever a Product is saved or deleted.
"""

import logging

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Product

logger = logging.getLogger(__name__)

# Must match the prefix used in views.py
_PREFIX = "products"


@receiver([post_save, post_delete], sender=Product)
def invalidate_product_cache(sender, instance, **kwargs):
    """
    Clears:
    - The specific detail-cache entry for this product's slug.
    - All list-cache entries (wildcard pattern delete via django-redis).

    Falls back to cache.clear() for non-Redis backends (e.g. LocMemCache
    during unit testing).
    """
    # Detail cache
    cache.delete(f"{_PREFIX}:detail:{instance.slug}")

    # List caches — pattern delete requires django-redis
    try:
        cache.delete_pattern(f"{_PREFIX}:list:*")
    except AttributeError:
        # LocMemCache / DummyCache don't have delete_pattern → nuke all
        cache.clear()

    logger.debug("Product cache invalidated for slug=%s", instance.slug)
