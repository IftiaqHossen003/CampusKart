from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.core.exceptions import ValidationError


@dataclass(frozen=True)
class ImageUploadPolicy:
    max_size_bytes: int = 5 * 1024 * 1024
    allowed_extensions: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})
    allowed_mime_types: frozenset[str] = frozenset({"image/jpeg", "image/png", "image/webp"})


DEFAULT_IMAGE_UPLOAD_POLICY = ImageUploadPolicy()


def validate_uploaded_image(uploaded_file, policy: ImageUploadPolicy | None = None, *, field_name: str = "file") -> None:
    if uploaded_file is None:
        raise ValidationError({field_name: "An image file is required."})

    active_policy = policy or DEFAULT_IMAGE_UPLOAD_POLICY

    file_name = getattr(uploaded_file, "name", "")
    suffix = Path(file_name).suffix.lower()
    content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
    size = int(getattr(uploaded_file, "size", 0) or 0)

    if suffix not in active_policy.allowed_extensions:
        raise ValidationError({field_name: "Unsupported image extension. Allowed: jpg, jpeg, png, webp."})

    if content_type not in active_policy.allowed_mime_types:
        raise ValidationError({field_name: "Unsupported image content type. Allowed: image/jpeg, image/png, image/webp."})

    if size > active_policy.max_size_bytes:
        raise ValidationError({field_name: "Image file must be smaller than 5MB."})
