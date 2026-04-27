from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-catalog-tests-cache",
        }
    }
)
class AdminCatalogApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            email="admin-catalog@example.com",
            password="StrongPass123!",
            full_name="Admin Catalog",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-catalog@example.com",
            password="StrongPass123!",
            full_name="Vendor Catalog",
            role="vendor",
            is_verified=True,
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_non_admin_cannot_access_catalog_admin_endpoints(self):
        self.client.force_authenticate(user=self.vendor_user)

        banner_response = self.client.get("/api/v1/admin/banners/")
        self.assertEqual(banner_response.status_code, status.HTTP_403_FORBIDDEN)

        category_response = self.client.get("/api/v1/admin/categories/")
        self.assertEqual(category_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_banner_crud(self):
        create_response = self.client.post(
            "/api/v1/admin/banners/",
            {
                "title": "Welcome Banner",
                "image_url": "https://example.com/banner.jpg",
                "link": "https://example.com/offers",
                "position": 1,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        banner_id = create_response.data["id"]

        list_response = self.client.get("/api/v1/admin/banners/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        list_results = list_response.data.get("results", list_response.data)
        self.assertEqual(len(list_results), 1)

        update_response = self.client.patch(
            f"/api/v1/admin/banners/{banner_id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertFalse(update_response.data["is_active"])

        delete_response = self.client.delete(f"/api/v1/admin/banners/{banner_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_category_crud(self):
        create_response = self.client.post(
            "/api/v1/admin/categories/",
            {
                "name": "Stationery",
                "icon_url": "https://example.com/stationery.png",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        category_id = create_response.data["id"]
        original_slug = create_response.data["slug"]
        self.assertTrue(original_slug)

        update_response = self.client.patch(
            f"/api/v1/admin/categories/{category_id}/",
            {"name": "Lab Stationery"},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(update_response.data["slug"], original_slug)

        delete_response = self.client.delete(f"/api/v1/admin/categories/{category_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
