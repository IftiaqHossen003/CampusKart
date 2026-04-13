from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


class CookieAuthFlowTests(APITestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            email="cookie-user@example.com",
            password="StrongPass123!",
            full_name="Cookie User",
            role="student",
            is_verified=True,
        )

        self.login_url = "/api/v1/auth/login/"
        self.refresh_url = "/api/v1/auth/token/refresh/"
        self.logout_url = "/api/v1/auth/logout/"
        self.bootstrap_url = "/api/v1/auth/bootstrap/"

    def _login(self):
        return self.client.post(
            self.login_url,
            {
                "email": self.user.email,
                "password": "StrongPass123!",
            },
            format="json",
        )

    def test_login_sets_refresh_cookie_and_omits_refresh_from_payload(self):
        response = self._login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("user", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)

    def test_refresh_works_with_cookie_only(self):
        login_response = self._login()
        refresh_cookie = login_response.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value

        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = refresh_cookie
        response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_refresh_with_invalid_cookie_returns_401_and_clears_cookie(self):
        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = "invalid-refresh-token"

        response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)
        self.assertEqual(response.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value, "")

    def test_logout_clears_cookie(self):
        login_response = self._login()
        refresh_cookie = login_response.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value

        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = refresh_cookie
        response = self.client.post(self.logout_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)
        self.assertEqual(response.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value, "")

    def test_bootstrap_returns_access_and_user_with_valid_cookie(self):
        login_response = self._login()
        refresh_cookie = login_response.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value

        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = refresh_cookie
        response = self.client.post(self.bootstrap_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], self.user.email)
