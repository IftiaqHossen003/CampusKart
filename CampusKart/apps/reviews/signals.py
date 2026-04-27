from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.products.models import Product

from .models import Review


def _recalculate_product_avg_rating(product_id: int) -> None:
    average = (
        Review.objects.filter(product_id=product_id, is_approved=True)
        .aggregate(avg_rating=Avg("rating"))
        .get("avg_rating")
    )

    normalized_average = Decimal("0.00")
    if average is not None:
        normalized_average = Decimal(str(average)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    Product.objects.filter(pk=product_id).update(avg_rating=normalized_average)


@receiver(post_save, sender=Review)
def recalculate_rating_on_review_save(sender, instance, **kwargs):
    _recalculate_product_avg_rating(instance.product_id)


@receiver(post_delete, sender=Review)
def recalculate_rating_on_review_delete(sender, instance, **kwargs):
    if instance.product_id:
        _recalculate_product_avg_rating(instance.product_id)
