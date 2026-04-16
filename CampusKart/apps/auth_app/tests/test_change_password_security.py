from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken


class ChangePasswordSecurityTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            email="change-password@example.com",
            password="CurrentPass123!",
            full_name="Password User",
            role="student",
            is_verified=True,
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_change_password_blacklists_existing_refresh_tokens(self):
        refresh = RefreshToken.for_user(self.user)

        response = self.client.patch(
            "/api/v1/auth/change-password/",
            {
                "old_password": "CurrentPass123!",
                "new_password": "UpdatedPass123!",
            },
            format="json",
        )

        self.user.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.check_password("UpdatedPass123!"))
        self.assertFalse(self.user.check_password("CurrentPass123!"))
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=str(refresh["jti"]), token__user=self.user).exists()
        )
