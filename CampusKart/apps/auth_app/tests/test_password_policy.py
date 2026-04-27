from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.auth_app.models import OTP
from apps.auth_app.validators import StrongPasswordValidator


class StrongPasswordValidatorTests(SimpleTestCase):
    def setUp(self):
        self.validator = StrongPasswordValidator(min_length=10)

    def test_rejects_password_shorter_than_min_length(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("Aa1!aaaaa")

        self.assertEqual(
            ctx.exception.messages,
            ["Password must be at least 10 characters long."],
        )

    def test_rejects_password_without_uppercase(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("strongpass1!")

        self.assertEqual(
            ctx.exception.messages,
            ["Password must contain at least one uppercase letter."],
        )

    def test_rejects_password_without_lowercase(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("STRONGPASS1!")

        self.assertEqual(
            ctx.exception.messages,
            ["Password must contain at least one lowercase letter."],
        )

    def test_rejects_password_without_number(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("StrongPass!!")

        self.assertEqual(
            ctx.exception.messages,
            ["Password must contain at least one number."],
        )

    def test_rejects_password_without_special_character(self):
        with self.assertRaises(ValidationError) as ctx:
            self.validator.validate("StrongPass12")

        self.assertEqual(
            ctx.exception.messages,
            ["Password must contain at least one special character."],
        )

    def test_accepts_password_at_min_length_with_all_requirements(self):
        try:
            self.validator.validate("Aa1!aaaaaa")
        except ValidationError as exc:  # pragma: no cover
            self.fail(f"Expected password to be valid, but got errors: {exc.messages}")


class PasswordPolicyApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="password-policy@example.com",
            password="CurrentPass123!",
            full_name="Password Policy User",
            role="student",
            is_verified=True,
            is_active=True,
        )

    def _create_reset_otp(self, code="112233"):
        return OTP.objects.create(
            user=self.user,
            purpose="password_reset",
            code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
            is_used=False,
        )

    def test_register_returns_strong_password_message_for_missing_special(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "registerpolicy2001@stud.kuet.ac.bd",
                "full_name": "Register Policy",
                "phone": "01710000100",
                "role": "student",
                "password": "StrongPass12",
                "password2": "StrongPass12",
                "student_id": "S2001",
                "department": "CSE",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertIn(
            "Password must contain at least one special character.",
            response.data["password"],
        )

    def test_change_password_returns_strong_password_message_for_missing_number(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            "/api/v1/auth/change-password/",
            {
                "old_password": "CurrentPass123!",
                "new_password": "StrongPass!!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.assertIn(
            "Password must contain at least one number.",
            response.data["new_password"],
        )

    def test_reset_password_returns_strong_password_message_for_missing_uppercase(self):
        self._create_reset_otp(code="112233")

        response = self.client.post(
            "/api/v1/auth/reset-password/",
            {
                "email": self.user.email,
                "code": "112233",
                "new_password": "strongpass1!",
                "new_password2": "strongpass1!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.assertIn(
            "Password must contain at least one uppercase letter.",
            response.data["new_password"],
        )

    def test_register_rejects_invalid_kuet_email_for_student_role(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "student@example.com",
                "full_name": "KUET Student",
                "phone": "01710000101",
                "role": "student",
                "password": "StrongPass123!",
                "password2": "StrongPass123!",
                "student_id": "S2002",
                "department": "CSE",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertIn("Invalid KUET email format", response.data["email"])

    def test_register_rejects_invalid_kuet_email_for_vendor_role(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "vendor@example.com",
                "full_name": "KUET Vendor",
                "phone": "01710000102",
                "role": "vendor",
                "password": "StrongPass123!",
                "password2": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertIn("Invalid KUET email format", response.data["email"])
