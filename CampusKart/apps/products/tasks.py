"""
Celery tasks for asynchronous product image uploads.
"""

from __future__ import annotations

import logging
import os
import importlib
from pathlib import Path

from celery import shared_task
from django.db import transaction

from .models import Product, ProductImage

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def upload_product_image(self, image_file: str, product_id: int, public_id: str, placeholder_id: int) -> dict:
    """
    Upload a local temp image file to Cloudinary, resize to max width 800,
    then update the placeholder ProductImage row with final URL/public_id.

    Args:
        image_file: absolute path to temporary image file
        product_id: Product primary key
        public_id: deterministic Cloudinary public_id
        placeholder_id: ProductImage row created at enqueue time
    """
    path = Path(image_file)
    uploader = importlib.import_module("cloudinary.uploader")

    if not path.exists():
        raise FileNotFoundError(f"Temp file not found: {image_file}")

    # Ensure product still exists to avoid orphan uploads.
    Product.objects.only("id").get(pk=product_id)

    upload_result = uploader.upload(
        str(path),
        folder="campuskart/products",
        public_id=public_id,
        overwrite=True,
        resource_type="image",
        transformation=[{"width": 800, "crop": "limit"}],
    )

    secure_url = upload_result.get("secure_url")
    final_public_id = upload_result.get("public_id", public_id)

    if not secure_url:
        raise ValueError("Cloudinary upload did not return a secure_url.")

    with transaction.atomic():
        image = ProductImage.objects.select_for_update().get(pk=placeholder_id, product_id=product_id)
        image.image_url = secure_url
        image.cloudinary_public_id = final_public_id
        image.save(update_fields=["image_url", "cloudinary_public_id"])

    try:
        os.remove(path)
    except OSError:
        logger.warning("Could not delete temp upload file: %s", path)

    return {
        "product_id": product_id,
        "image_id": placeholder_id,
        "image_url": secure_url,
        "public_id": final_public_id,
    }
