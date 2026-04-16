from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_api.models import Banner


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-banner-tests-cache",
        }
    }
)
class BannerApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            email="admin-banner@example.com",
            password="StrongPass123!",
            full_name="Admin Banner",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-banner@example.com",
            password="StrongPass123!",
            full_name="Vendor Banner",
            role="vendor",
            is_verified=True,
        )

    def test_non_admin_cannot_access_banner_admin_endpoints(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.get("/api/v1/admin/banners/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        reorder_response = self.client.patch(
            "/api/v1/admin/banners/reorder/",
            {"items": [1]},
            format="json",
        )
        self.assertEqual(reorder_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_banner_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        create_response = self.client.post(
            "/api/v1/admin/banners/",
            {
                "title": "Semester Sale",
                "image_url": "https://example.com/semester-sale.jpg",
                "link": "https://example.com/sale",
                "position": 1,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        banner_id = create_response.data["id"]

        update_response = self.client.patch(
            f"/api/v1/admin/banners/{banner_id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertFalse(update_response.data["is_active"])

        delete_response = self.client.delete(f"/api/v1/admin/banners/{banner_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_public_banners_returns_only_active_ordered_by_position(self):
        Banner.objects.create(
            title="Second",
            image_url="https://example.com/second.jpg",
            position=2,
            is_active=True,
        )
        Banner.objects.create(
            title="First",
            image_url="https://example.com/first.jpg",
            position=1,
            is_active=True,
        )
        Banner.objects.create(
            title="Hidden",
            image_url="https://example.com/hidden.jpg",
            position=0,
            is_active=False,
        )

        response = self.client.get("/api/v1/banners/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual([item["title"] for item in response.data], ["First", "Second"])

    def test_admin_reorder_updates_positions_and_preserves_remaining_items(self):
        self.client.force_authenticate(user=self.admin_user)

        first = Banner.objects.create(
            title="One",
            image_url="https://example.com/1.jpg",
            position=0,
            is_active=True,
        )
        second = Banner.objects.create(
            title="Two",
            image_url="https://example.com/2.jpg",
            position=1,
            is_active=True,
        )
        third = Banner.objects.create(
            title="Three",
            image_url="https://example.com/3.jpg",
            position=2,
            is_active=True,
        )

        response = self.client.patch(
            "/api/v1/admin/banners/reorder/",
            {"items": [third.id, first.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ordered_ids = list(Banner.objects.order_by("position", "id").values_list("id", flat=True))
        self.assertEqual(ordered_ids, [third.id, first.id, second.id])

    def test_admin_can_create_banner_with_image_file_upload(self):
        self.client.force_authenticate(user=self.admin_user)

        image_file = SimpleUploadedFile(
            "banner.png",
            b"\x89PNG\r\n\x1a\n" + (b"a" * 128),
            content_type="image/png",
        )

        with patch(
            "apps.admin_api.serializers.cloudinary.uploader.upload",
            return_value={"secure_url": "https://example.com/uploaded-banner.png"},
        ):
            response = self.client.post(
                "/api/v1/admin/banners/",
                {
                    "title": "Uploaded Banner",
                    "link": "https://example.com/promo",
                    "position": 0,
                    "is_active": True,
                    "image_file": image_file,
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["image_url"], "https://example.com/uploaded-banner.png")
