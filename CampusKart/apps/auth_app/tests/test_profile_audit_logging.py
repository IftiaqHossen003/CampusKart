from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_api.models import AdminAuditLog


class ProfileAuditLoggingTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.student_user = user_model.objects.create_user(
            email="student-audit@example.com",
            password="StrongPass123!",
            full_name="Student Audit",
            role="student",
            is_verified=True,
        )

    def test_patch_me_creates_user_profile_audit_log(self):
        self.client.force_authenticate(user=self.student_user)

        response = self.client.patch(
            "/api/v1/auth/me/",
            {
                "full_name": "Student Audit Updated",
                "phone": "01700000000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["full_name"], "Student Audit Updated")

        audit_log = AdminAuditLog.objects.filter(
            action="user_profile_updated",
            resource_type="user_profile",
            actor=self.student_user,
            resource_id=str(self.student_user.pk),
        ).first()

        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.request_method, "PATCH")
        self.assertEqual(audit_log.request_path, "/api/v1/auth/me/")
        self.assertEqual(audit_log.before.get("full_name"), "Student Audit")
        self.assertEqual(audit_log.after.get("full_name"), "Student Audit Updated")
        self.assertIn("full_name", audit_log.metadata.get("updated_fields", []))
        self.assertIn("phone", audit_log.metadata.get("updated_fields", []))
