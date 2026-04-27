from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_api.models import AdminAuditLog
from apps.vendors.models import VendorProfile


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "admin-audit-log-tests-cache",
        }
    }
)
class AdminAuditLogsApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            email="admin-audit@example.com",
            password="StrongPass123!",
            full_name="Admin Audit",
            role="admin",
            is_verified=True,
        )
        self.vendor_user = user_model.objects.create_user(
            email="vendor-audit@example.com",
            password="StrongPass123!",
            full_name="Vendor Audit",
            role="vendor",
            is_verified=True,
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            shop_name="Audit Vendor Shop",
            status=VendorProfile.Status.PENDING,
        )

    def test_audit_logs_require_admin(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_audit_logs_list_and_filters(self):
        self.client.force_authenticate(user=self.admin_user)

        self.client.post(
            f"/api/v1/admin/vendors/{self.vendor_profile.id}/approve/",
            {"reason": "kyc"},
            format="json",
        )

        self.assertTrue(AdminAuditLog.objects.exists())

        list_response = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        list_results = list_response.data.get("results", list_response.data)
        self.assertGreaterEqual(len(list_results), 1)

        filter_response = self.client.get("/api/v1/admin/audit-logs/?action=vendor_approved")
        self.assertEqual(filter_response.status_code, status.HTTP_200_OK)
        filter_results = filter_response.data.get("results", filter_response.data)
        self.assertGreaterEqual(len(filter_results), 1)

        self.assertTrue(
            AdminAuditLog.objects.filter(action="vendor_approved", resource_type="vendor_profile").exists()
        )
