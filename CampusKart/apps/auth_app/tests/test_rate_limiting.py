from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "auth-rate-limit-tests",
        }
    },
    GLOBAL_API_RATELIMIT_PER_MINUTE=100,
    AUTH_LOGIN_RATELIMIT="2/m",
    AUTH_REGISTER_RATELIMIT="2/m",
)
class AuthRateLimitingTests(APITestCase):
    def setUp(self):
        cache.clear()

        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="rate-limit-user@example.com",
            password="StrongPass123!",
            full_name="Rate Limit User",
            role="student",
            is_verified=True,
        )
        self.other_user = user_model.objects.create_user(
            email="rate-limit-other@example.com",
            password="StrongPass123!",
            full_name="Rate Limit Other",
            role="student",
            is_verified=True,
        )

    def test_login_rate_limit_returns_429(self):
        payload = {"email": self.user.email, "password": "StrongPass123!"}

        first_response = self.client.post("/api/v1/auth/login/", payload, format="json")
        second_response = self.client.post("/api/v1/auth/login/", payload, format="json")
        third_response = self.client.post("/api/v1/auth/login/", payload, format="json")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(third_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(third_response.data.get("code"), "auth_rate_limited")

    @patch("apps.auth_app.views.send_verification_email.delay")
    def test_register_rate_limit_returns_429(self, mock_send_verification_email):
        first_response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "rateregister1001@stud.kuet.ac.bd",
                "full_name": "Rate Register One",
                "phone": "01710000001",
                "role": "student",
                "password": "StrongPass123!",
                "password2": "StrongPass123!",
                "student_id": "S1001",
                "department": "CSE",
            },
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "rateregister1002@stud.kuet.ac.bd",
                "full_name": "Rate Register Two",
                "phone": "01710000002",
                "role": "student",
                "password": "StrongPass123!",
                "password2": "StrongPass123!",
                "student_id": "S1002",
                "department": "EEE",
            },
            format="json",
        )
        third_response = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "rateregister1003@stud.kuet.ac.bd",
                "full_name": "Rate Register Three",
                "phone": "01710000003",
                "role": "student",
                "password": "StrongPass123!",
                "password2": "StrongPass123!",
                "student_id": "S1003",
                "department": "BBA",
            },
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(third_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(third_response.data.get("code"), "auth_rate_limited")
        self.assertEqual(mock_send_verification_email.call_count, 2)

    @override_settings(
        GLOBAL_API_RATELIMIT_PER_MINUTE=2,
        AUTH_LOGIN_RATELIMIT="100/m",
    )
    def test_global_api_rate_limit_applies_to_api_v1_routes(self):
        first_response = self.client.get("/api/v1/auth/session-policy/")
        second_response = self.client.get("/api/v1/auth/session-policy/")
        third_response = self.client.get("/api/v1/auth/session-policy/")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(third_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(third_response.json().get("code"), "api_rate_limited")
        self.assertEqual(first_response.headers.get("X-RateLimit-Limit"), "2")
        self.assertEqual(second_response.headers.get("X-RateLimit-Limit"), "2")
        self.assertEqual(second_response.headers.get("X-RateLimit-Remaining"), "0")
        self.assertEqual(third_response.headers.get("X-RateLimit-Limit"), "2")
        self.assertEqual(third_response.headers.get("X-RateLimit-Remaining"), "0")
        self.assertTrue(int(third_response.headers.get("Retry-After", "0")) >= 1)

    @override_settings(
        GLOBAL_API_RATELIMIT_PER_MINUTE=1,
        AUTH_LOGIN_RATELIMIT="100/m",
    )
    def test_global_rate_limit_uses_per_user_bucket_for_bearer_tokens(self):
        access_one = str(RefreshToken.for_user(self.user).access_token)
        access_two = str(RefreshToken.for_user(self.other_user).access_token)

        first_user_response = self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_one}",
        )
        second_user_response = self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_two}",
        )

        self.assertEqual(first_user_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_user_response.status_code, status.HTTP_200_OK)

        repeat_first_user_response = self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_one}",
        )
        self.assertEqual(repeat_first_user_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
