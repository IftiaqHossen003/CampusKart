from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase


class LoginVerificationRequirementTests(APITestCase):
    def setUp(self):
        self.login_url = "/api/v1/auth/login/"
        self.user_model = get_user_model()

    def test_unverified_user_cannot_login(self):
        self.user_model.objects.create_user(
            email="unverified@example.com",
            password="SafePass123!",
            full_name="Unverified User",
            role="student",
            is_verified=False,
        )

        response = self.client.post(
            self.login_url,
            {"email": "unverified@example.com", "password": "SafePass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            str(response.data.get("detail")),
            "Email is not verified. Please verify your email before logging in.",
        )

    def test_verified_user_can_login(self):
        self.user_model.objects.create_user(
            email="verified@example.com",
            password="SafePass123!",
            full_name="Verified User",
            role="student",
            is_verified=True,
        )

        response = self.client.post(
            self.login_url,
            {"email": "verified@example.com", "password": "SafePass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "verified@example.com")
        self.assertTrue(response.data["user"]["is_verified"])
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)
