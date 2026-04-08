from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_app.models import OTP


class ForgotResetPasswordTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            email="student@example.com",
            password="CurrentPass123!",
            full_name="Student One",
            role="student",
            is_verified=True,
            is_active=True,
        )

        self.forgot_url = "/api/v1/auth/forgot-password/"
        self.reset_url = "/api/v1/auth/reset-password/"
        self.generic_message = "If that email exists, a reset code has been sent."

    def _create_reset_otp(self, code="111111", expires_at=None, is_used=False):
        return OTP.objects.create(
            user=self.user,
            purpose="password_reset",
            code=code,
            expires_at=expires_at or timezone.now() + timedelta(minutes=10),
            is_used=is_used,
        )

    @patch("apps.auth_app.views.send_password_reset_email.delay")
    def test_forgot_password_returns_generic_message_for_existing_and_non_existing(self, mock_delay):
        existing_response = self.client.post(
            self.forgot_url,
            {"email": "student@example.com"},
            format="json",
        )
        non_existing_response = self.client.post(
            self.forgot_url,
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(existing_response.status_code, status.HTTP_200_OK)
        self.assertEqual(non_existing_response.status_code, status.HTTP_200_OK)
        self.assertEqual(existing_response.data["detail"], self.generic_message)
        self.assertEqual(non_existing_response.data["detail"], self.generic_message)
        mock_delay.assert_called_once_with(self.user.pk)

    @patch("apps.auth_app.views.send_password_reset_email.delay")
    def test_forgot_password_invalidates_old_unused_otps_and_dispatches_task(self, mock_delay):
        old_otp = self._create_reset_otp(code="111111", is_used=False)

        response = self.client.post(
            self.forgot_url,
            {"email": "student@example.com"},
            format="json",
        )

        old_otp.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(old_otp.is_used)
        mock_delay.assert_called_once_with(self.user.pk)

    def test_reset_password_fails_for_wrong_otp(self):
        otp = self._create_reset_otp(code="111111")

        response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "222222",
                "new_password": "NewStrongPass123!",
                "new_password2": "NewStrongPass123!",
            },
            format="json",
        )

        otp.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)
        self.assertFalse(otp.is_used)

    def test_reset_password_fails_for_expired_otp(self):
        expired_otp = self._create_reset_otp(
            code="111111",
            expires_at=timezone.now() - timedelta(minutes=1),
        )

        response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "111111",
                "new_password": "NewStrongPass123!",
                "new_password2": "NewStrongPass123!",
            },
            format="json",
        )

        expired_otp.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)
        self.assertFalse(expired_otp.is_used)

    def test_reset_password_fails_for_weak_password(self):
        otp = self._create_reset_otp(code="111111")

        response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "111111",
                "new_password": "12345678",
                "new_password2": "12345678",
            },
            format="json",
        )

        otp.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.assertFalse(otp.is_used)

    def test_reset_password_success_updates_password_and_blacklists_refresh_tokens(self):
        otp = self._create_reset_otp(code="111111")
        refresh = RefreshToken.for_user(self.user)

        response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "111111",
                "new_password": "NewStrongPass123!",
                "new_password2": "NewStrongPass123!",
            },
            format="json",
        )

        self.user.refresh_from_db()
        otp.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.check_password("NewStrongPass123!"))
        self.assertFalse(self.user.check_password("CurrentPass123!"))
        self.assertTrue(otp.is_used)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=str(refresh["jti"]), token__user=self.user).exists()
        )

    @patch("apps.auth_app.views.send_password_reset_email.delay")
    def test_resend_invalidates_prior_otp_and_only_latest_code_works(self, mock_delay):
        old_otp = self._create_reset_otp(code="111111")

        forgot_response = self.client.post(
            self.forgot_url,
            {"email": "student@example.com"},
            format="json",
        )

        old_otp.refresh_from_db()
        latest_otp = self._create_reset_otp(code="222222")

        old_code_response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "111111",
                "new_password": "AnotherStrongPass123!",
                "new_password2": "AnotherStrongPass123!",
            },
            format="json",
        )

        latest_code_response = self.client.post(
            self.reset_url,
            {
                "email": "student@example.com",
                "code": "222222",
                "new_password": "AnotherStrongPass123!",
                "new_password2": "AnotherStrongPass123!",
            },
            format="json",
        )

        latest_otp.refresh_from_db()

        self.assertEqual(forgot_response.status_code, status.HTTP_200_OK)
        self.assertTrue(old_otp.is_used)
        self.assertEqual(old_code_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", old_code_response.data)
        self.assertEqual(latest_code_response.status_code, status.HTTP_200_OK)
        self.assertTrue(latest_otp.is_used)
        mock_delay.assert_called_once_with(self.user.pk)
