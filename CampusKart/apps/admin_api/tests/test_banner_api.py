from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase


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
