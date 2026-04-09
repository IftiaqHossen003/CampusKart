"""
Signal handlers for the products app.
Invalidates Redis cache entries whenever a Product is saved or deleted.
"""

import logging

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Category, Product, ProductImage, ProductTag

logger = logging.getLogger(__name__)

# Must match the prefix used in views.py
_PREFIX = "products"


def _invalidate_list_caches():
    """
    Clears all product list caches.

    Falls back to cache.clear() for backends without delete_pattern
    (e.g. LocMemCache during unit testing).
    """
    delete_pattern = getattr(cache, "delete_pattern", None)
    if callable(delete_pattern):
        delete_pattern(f"{_PREFIX}:list:*")
    else:
        cache.clear()


def _invalidate_list_and_tags_caches():
    """
    Clears list and global tags caches.

    Falls back to cache.clear() for non-Redis backends (e.g. LocMemCache
    during unit testing).
    """
    _invalidate_list_caches()
    cache.delete(f"{_PREFIX}:tags")


def _invalidate_category_caches():
    """
    Clears category list/detail caches.
    """
    delete_pattern = getattr(cache, "delete_pattern", None)
    if callable(delete_pattern):
        delete_pattern(f"{_PREFIX}:category:*")
    else:
        cache.clear()

    cache.delete(f"{_PREFIX}:categories")
    cache.delete(f"{_PREFIX}:categories:v2")


@receiver([post_save, post_delete], sender=Product)
def invalidate_product_cache(sender, instance, **kwargs):
    """
    Clears:
    - The specific detail-cache entry for this product's slug.
    - All list-cache entries (wildcard pattern delete via django-redis).
    - Global tags cache used by the product-tags endpoint.

    Falls back to cache.clear() for non-Redis backends (e.g. LocMemCache
    during unit testing).
    """
    # Detail cache
    cache.delete(f"{_PREFIX}:detail:{instance.slug}")

    _invalidate_list_and_tags_caches()

    logger.debug("Product cache invalidated for slug=%s", instance.slug)


@receiver([post_save, post_delete], sender=ProductTag)
def invalidate_product_tag_cache(sender, instance, **kwargs):
    """
    Clears caches impacted by tag mutations.

    - Detail cache for the related product.
    - All list caches (tag filters/search rely on ProductTag relations).
    - Global tags cache.
    """
    if instance.product_id:
        slug = Product.objects.filter(pk=instance.product_id).values_list("slug", flat=True).first()
        if slug:
            cache.delete(f"{_PREFIX}:detail:{slug}")

    _invalidate_list_and_tags_caches()

    logger.debug("Product tag cache invalidated for product_id=%s", instance.product_id)


@receiver([post_save, post_delete], sender=ProductImage)
def invalidate_product_cache_on_image_change(sender, instance, **kwargs):
    """Image mutations affect list/detail payloads, so invalidate those caches."""
    if instance.product_id:
        slug = Product.objects.filter(pk=instance.product_id).values_list("slug", flat=True).first()
        if slug:
            cache.delete(f"{_PREFIX}:detail:{slug}")

    _invalidate_list_caches()

    logger.debug("Product image cache invalidated for product_id=%s", instance.product_id)


@receiver([post_save, post_delete], sender=Category)
def invalidate_category_cache(sender, instance, **kwargs):
    """Category mutations should be reflected immediately in category endpoints."""
    _invalidate_category_caches()

    logger.debug("Category cache invalidated for category_id=%s", instance.id)