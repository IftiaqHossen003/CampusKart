from django.contrib.auth import get_user_model
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.products.models import Category, Product
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "product-upload-validation-tests",
        }
    }
)
class ProductImageUploadValidationTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.vendor_user = user_model.objects.create_user(
            email="vendor-upload@example.com",
            password="StrongPass123!",
            full_name="Vendor Upload",
            role="vendor",
            is_verified=True,
        )

        self.vendor = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Upload Shop",
            status=VendorProfile.Status.APPROVED,
        )

        self.category = Category.objects.create(
            name="Upload Category",
            slug="upload-category",
            is_active=True,
        )

        self.product = Product.objects.create(
            vendor=self.vendor,
            category=self.category,
            name="Upload Product",
            slug="upload-product",
            description="Upload validation product",
            price="100.00",
            stock=5,
            status=Product.Status.APPROVED,
        )

        self.client.force_authenticate(user=self.vendor_user)

    def test_rejects_invalid_image_extension_and_mime(self):
        bad_file = SimpleUploadedFile("avatar.txt", b"not-an-image", content_type="text/plain")

        response = self.client.post(
            f"/api/v1/products/{self.product.id}/images/",
            {"image": bad_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Unsupported image extension", response.data.get("detail", ""))

    def test_rejects_image_larger_than_five_mb(self):
        oversize_content = b"\x89PNG\r\n\x1a\n" + (b"a" * (5 * 1024 * 1024 + 1))
        large_file = SimpleUploadedFile("large.png", oversize_content, content_type="image/png")

        response = self.client.post(
            f"/api/v1/products/{self.product.id}/images/",
            {"image": large_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("detail"), "Image file must be smaller than 5MB.")
