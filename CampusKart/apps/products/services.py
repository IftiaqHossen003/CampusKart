from django.utils import timezone

from apps.notifications.tasks import create_notification

from .models import Product


def moderate_product_status(*, product: Product, actor, target_status: str) -> bool:
    """Set product status and emit approval notification only on real state changes.

    Returns True when the status changed, otherwise False.
    """
    if product.status == target_status:
        return False

    product.status = target_status
    product.approved_by = actor
    product.approved_at = timezone.now()
    product.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    if target_status == Product.Status.APPROVED:
        vendor_user_id = getattr(getattr(product, "vendor", None), "user_id", None)
        if vendor_user_id:
            create_notification(
                vendor_user_id,
                "product",
                "Product approved",
                f"Your product '{product.name}' has been approved.",
                "/vendor/products",
            )

    return True
