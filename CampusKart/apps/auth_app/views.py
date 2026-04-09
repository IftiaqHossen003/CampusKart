"""
Views for auth_app.
All endpoints live under /api/v1/auth/
"""

import logging

from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView as BaseTokenRefreshView,
    TokenVerifyView as BaseTokenVerifyView,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import OTP
from .serializers import (
    CustomUserSerializer,
    RegisterSerializer,
    LoginSerializer,
    VerifyEmailSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    ChangePasswordSerializer,
)
from .tasks import send_verification_email, send_password_reset_email
from .throttles import ForgotPasswordThrottle, ResetPasswordThrottle

User = get_user_model()
logger = logging.getLogger(__name__)

GENERIC_PASSWORD_RESET_MESSAGE = "If that email exists, a reset code has been sent."


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

class RegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/register/

    Creates a new user account and dispatches a verification e-mail via Celery.
    Returns the created user data (no tokens — user must verify email first).
    """
    queryset           = User.objects.all()
    serializer_class   = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Dispatch verification email asynchronously
        send_verification_email.delay(user.pk)

        return Response(
            {
                "detail": "Account created. Please check your email for the verification code.",
                "user": CustomUserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class LoginView(TokenObtainPairView):
    """
    POST /api/v1/auth/login/

    Returns JWT access + refresh tokens with extra claims (role, is_verified…).
    Body: { "email": "...", "password": "..." }
    """
    serializer_class   = LoginSerializer
    permission_classes = [permissions.AllowAny]


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

class TokenRefreshView(BaseTokenRefreshView):
    """
    POST /api/v1/auth/token/refresh/

    Standard simplejwt refresh — returns a new access token.
    Body: { "refresh": "<refresh_token>" }
    """
    permission_classes = [permissions.AllowAny]


class TokenVerifyView(BaseTokenVerifyView):
    """
    POST /api/v1/auth/token/verify/

    Verifies whether a provided JWT token is still valid.
    Body: { "token": "<access_or_refresh_token>" }
    """

    permission_classes = [permissions.AllowAny]


class SessionPolicyView(APIView):
    """
    GET /api/v1/auth/session-policy/

    Exposes backend session/token timing so frontend can hydrate and expire
    auth state consistently with server policy.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        jwt_settings = settings.SIMPLE_JWT
        access_lifetime = int(jwt_settings["ACCESS_TOKEN_LIFETIME"].total_seconds())
        refresh_lifetime = int(jwt_settings["REFRESH_TOKEN_LIFETIME"].total_seconds())

        return Response(
            {
                "access_token_lifetime_seconds": access_lifetime,
                "refresh_token_lifetime_seconds": refresh_lifetime,
                "rotate_refresh_tokens": bool(jwt_settings.get("ROTATE_REFRESH_TOKENS", False)),
                "blacklist_after_rotation": bool(jwt_settings.get("BLACKLIST_AFTER_ROTATION", False)),
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

class VerifyEmailView(APIView):
    """
    POST /api/v1/auth/verify-email/

    Body: { "email": "...", "code": "123456" }
    Marks the user as verified when OTP matches.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        user.is_verified = True
        user.save(update_fields=["is_verified"])

        # Issue tokens immediately after verification
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "detail": "Email verified successfully.",
                "access":  str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Resend verification OTP
# ---------------------------------------------------------------------------

class ResendVerificationView(APIView):
    """
    POST /api/v1/auth/resend-verification/

    Body: { "email": "..." }
    Creates a fresh OTP and re-sends the verification email.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Return 200 regardless to avoid user-enumeration
            return Response(
                {"detail": "If that email exists, a new code has been sent."},
                status=status.HTTP_200_OK,
            )

        if user.is_verified:
            return Response(
                {"detail": "This account is already verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        send_verification_email.delay(user.pk)
        return Response(
            {"detail": "If that email exists, a new code has been sent."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------

class ForgotPasswordView(APIView):
    """
    POST /api/v1/auth/forgot-password/

    Body: { "email": "..." }
    Always returns a generic success message to prevent user enumeration.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ForgotPasswordThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        user = User.objects.filter(email=email, is_active=True).first()

        logger.info("Password reset requested email=%s user_found=%s", email, bool(user))

        if user is not None:
            OTP.objects.filter(user=user, purpose="password_reset", is_used=False).update(is_used=True)
            send_password_reset_email.delay(user.pk)

        return Response({"detail": GENERIC_PASSWORD_RESET_MESSAGE}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    """
    POST /api/v1/auth/reset-password/

    Body: { "email": "...", "code": "123456", "new_password": "...", "new_password2": "..." }
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ResetPasswordThrottle]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        self._blacklist_user_refresh_tokens(user)
        logger.info("Password reset completed user_id=%s email=%s", user.pk, user.email)

        return Response(
            {"detail": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _blacklist_user_refresh_tokens(user):
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)


# ---------------------------------------------------------------------------
# Current user profile
# ---------------------------------------------------------------------------

class MeView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/v1/auth/me/  — retrieve own profile
    PATCH /api/v1/auth/me/  — update full_name, phone, avatar
    """
    serializer_class = CustomUserSerializer

    def get_object(self):
        return self.request.user


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------

class ChangePasswordView(generics.UpdateAPIView):
    """
    PATCH /api/v1/auth/change-password/

    Body: { "old_password": "...", "new_password": "..." }
    """
    serializer_class = ChangePasswordSerializer
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Logout (blacklist refresh token)
# ---------------------------------------------------------------------------

class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/

    Body: { "refresh": "<refresh_token>" }
    Blacklists the supplied refresh token.
    """

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            detail = "Logged out successfully."
            already_invalid = False
        except Exception:
            # Keep logout idempotent so frontend can always clear session safely.
            logger.info("Logout received an invalid or already-blacklisted refresh token.")
            detail = "Session was already invalidated."
            already_invalid = True

        return Response(
            {
                "detail": detail,
                "already_invalid": already_invalid,
            },
            status=status.HTTP_200_OK,
        )
