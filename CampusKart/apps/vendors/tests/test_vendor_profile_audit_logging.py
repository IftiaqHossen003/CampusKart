from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_api.models import AdminAuditLog


class VendorProfileAuditLoggingTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.vendor_user = user_model.objects.create_user(
            email="vendor-audit@example.com",
            password="StrongPass123!",
            full_name="Vendor Audit",
            role="vendor",
            is_verified=True,
        )

    def test_patch_vendor_me_creates_vendor_profile_audit_log(self):
        self.client.force_authenticate(user=self.vendor_user)

        response = self.client.patch(
            "/api/v1/vendors/me/",
            {
                "shop_name": "Vendor Audit Shop",
                "contact_phone": "01800000000",
                "contact_email": "vendor-audit@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["shop_name"], "Vendor Audit Shop")

        audit_log = AdminAuditLog.objects.filter(
            action="vendor_profile_updated",
            resource_type="vendor_profile",
            actor=self.vendor_user,
        ).first()

        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.request_method, "PATCH")
        self.assertEqual(audit_log.request_path, "/api/v1/vendors/me/")
        self.assertEqual(audit_log.before.get("shop_name"), "Vendor Audit")
        self.assertEqual(audit_log.after.get("shop_name"), "Vendor Audit Shop")
        self.assertIn("shop_name", audit_log.metadata.get("updated_fields", []))
