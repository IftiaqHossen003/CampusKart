from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-category-tests-cache",
        }
    }
)
class CategoryAdminApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            email="admin-category@example.com",
            password="StrongPass123!",
            full_name="Admin Category",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-category@example.com",
            password="StrongPass123!",
            full_name="Vendor Category",
            role="vendor",
            is_verified=True,
        )

    def test_non_admin_cannot_access_category_admin_endpoints(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.get("/api/v1/admin/categories/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_category_crud(self):
        self.client.force_authenticate(user=self.admin_user)

        create_response = self.client.post(
            "/api/v1/admin/categories/",
            {
                "name": "Lab Supplies",
                "icon_url": "https://example.com/lab.png",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        category_id = create_response.data["id"]
        original_slug = create_response.data["slug"]

        update_response = self.client.patch(
            f"/api/v1/admin/categories/{category_id}/",
            {"name": "Advanced Lab Supplies"},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(update_response.data["slug"], original_slug)

        delete_response = self.client.delete(f"/api/v1/admin/categories/{category_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
