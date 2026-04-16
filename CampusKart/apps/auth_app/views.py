"""
Views for auth_app.
All endpoints live under /api/v1/auth/
"""

import logging

from django.contrib.auth import get_user_model
from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView as BaseTokenRefreshView,
    TokenVerifyView as BaseTokenVerifyView,
)
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django_ratelimit.core import is_ratelimited

from .models import OTP
from .cookies import get_refresh_cookie, set_refresh_cookie, clear_refresh_cookie
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
from apps.admin_api.services import write_admin_audit_log

User = get_user_model()
logger = logging.getLogger(__name__)

GENERIC_PASSWORD_RESET_MESSAGE = "If that email exists, a reset code has been sent."


def _get_request_payload_value(request, key: str):
    data = getattr(request, "data", None)

    if isinstance(data, dict):
        return data.get(key)

    getter = getattr(data, "get", None)
    if callable(getter):
        return getter(key)

    return None


def _normalize_token_value(value):
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized

    return None


def _auth_rate_limited_response():
    return Response(
        {
            "detail": "Too many requests. Please try again later.",
            "code": "auth_rate_limited",
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _is_auth_endpoint_rate_limited(request, *, group: str, rate: str, key: str) -> bool:
    return bool(
        is_ratelimited(
            request=request,
            group=group,
            fn=None,
            key=key,
            rate=rate,
            method=["POST"],
            increment=True,
        )
    )


def _blacklist_user_refresh_tokens(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


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
        register_rate = getattr(settings, "AUTH_REGISTER_RATELIMIT", "10/m")
        if _is_auth_endpoint_rate_limited(
            request,
            group="auth.register.ip",
            rate=register_rate,
            key="ip",
        ):
            return _auth_rate_limited_response()

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

    Returns JWT access token with extra claims (role, is_verified…).
    Refresh token is issued as HttpOnly session cookie.
    Body: { "email": "...", "password": "..." }
    """
    serializer_class   = LoginSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        login_rate = getattr(settings, "AUTH_LOGIN_RATELIMIT", "10/m")

        ip_rate_limited = _is_auth_endpoint_rate_limited(
            request,
            group="auth.login.ip",
            rate=login_rate,
            key="ip",
        )
        email_rate_limited = _is_auth_endpoint_rate_limited(
            request,
            group="auth.login.email",
            rate=login_rate,
            key="post:email",
        )
        if ip_rate_limited or email_rate_limited:
            return _auth_rate_limited_response()

        response = super().post(request, *args, **kwargs)

        if response.status_code != status.HTTP_200_OK:
            return response

        response_data = response.data if isinstance(response.data, dict) else {}
        refresh_token = _normalize_token_value(response_data.pop("refresh", None))
        if refresh_token:
            set_refresh_cookie(response, refresh_token)

        return response


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

@method_decorator(csrf_protect, name="dispatch")
class TokenRefreshView(BaseTokenRefreshView):
    """
    POST /api/v1/auth/token/refresh/

    Standard simplejwt refresh — returns a new access token.
    Refresh token is read from HttpOnly cookie by default.
    Body refresh token is accepted temporarily for backward compatibility.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_token = _normalize_token_value(
            _get_request_payload_value(request, "refresh") or get_refresh_cookie(request)
        )

        if not refresh_token:
            response = Response(
                {"detail": "Refresh token not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})

        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            response = Response(
                {"detail": "Refresh token is invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        validated_data = serializer.validated_data if isinstance(serializer.validated_data, dict) else {}
        rotated_refresh_token = _normalize_token_value(validated_data.pop("refresh", None))

        response = Response(validated_data, status=status.HTTP_200_OK)
        set_refresh_cookie(response, rotated_refresh_token or refresh_token)
        return response


class TokenVerifyView(BaseTokenVerifyView):
    """
    POST /api/v1/auth/token/verify/

    Verifies whether a provided JWT token is still valid.
    Body: { "token": "<access_or_refresh_token>" }
    """

    permission_classes = [permissions.AllowAny]


class CsrfCookieView(APIView):
    """
    GET /api/v1/auth/csrf/

    Sets a CSRF cookie for clients that use cookie-backed auth endpoints.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        csrf_token = get_token(request)
        return Response(
            {
                "detail": "CSRF cookie set.",
                "csrf_token": csrf_token,
            },
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_protect, name="dispatch")
class BootstrapSessionView(APIView):
    """
    POST /api/v1/auth/bootstrap/

    Hydrates SPA auth state using the refresh token from HttpOnly cookie.
    Returns a fresh access token and user payload.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = _normalize_token_value(get_refresh_cookie(request))

        if not refresh_token:
            response = Response(
                {"detail": "No active session."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})

        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            response = Response(
                {"detail": "Session is invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        validated_data = serializer.validated_data if isinstance(serializer.validated_data, dict) else {}
        access_token = validated_data.get("access")

        if not access_token:
            response = Response(
                {"detail": "Unable to issue access token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        try:
            token = AccessToken(access_token)
            user_id = token.get("user_id")
            user = User.objects.get(pk=user_id)
        except Exception:
            response = Response(
                {"detail": "Unable to resolve session user."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        response = Response(
            {
                "access": access_token,
                "user": CustomUserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

        rotated_refresh_token = _normalize_token_value(validated_data.get("refresh"))
        set_refresh_cookie(response, rotated_refresh_token or refresh_token)
        return response


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
        response = Response(
            {
                "detail": "Email verified successfully.",
                "access":  str(refresh.access_token),
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, str(refresh))
        return response


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

        _blacklist_user_refresh_tokens(user)
        logger.info("Password reset completed user_id=%s email=%s", user.pk, user.email)

        return Response(
            {"detail": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )

# ---------------------------------------------------------------------------
# Current user profile
# ---------------------------------------------------------------------------

class MeView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/v1/auth/me/  — retrieve own profile
    PATCH /api/v1/auth/me/  — update full_name, phone, avatar
    """
    serializer_class = CustomUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        instance = self.get_object()
        before_snapshot = CustomUserSerializer(
            instance=instance,
            context={"request": self.request},
        ).data
        updated_instance = serializer.save()
        after_snapshot = CustomUserSerializer(
            instance=updated_instance,
            context={"request": self.request},
        ).data

        write_admin_audit_log(
            actor=self.request.user,
            action="user_profile_updated",
            resource_type="user_profile",
            resource_id=str(updated_instance.pk),
            request_method=self.request.method or "",
            request_path=self.request.path,
            before=dict(before_snapshot),
            after=dict(after_snapshot),
            metadata={
                "updated_fields": sorted(list(serializer.validated_data.keys())),
            },
        )


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
        user = serializer.save()
        _blacklist_user_refresh_tokens(user)
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Logout (blacklist refresh token)
# ---------------------------------------------------------------------------

@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/

    Uses refresh token from HttpOnly cookie (or body fallback) and blacklists it.
    Always clears the refresh cookie.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = _normalize_token_value(
            _get_request_payload_value(request, "refresh") or get_refresh_cookie(request)
        )

        detail = "Logged out successfully."
        already_invalid = False

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)  # type: ignore[arg-type]
                token.blacklist()
            except Exception:
                # Keep logout idempotent so frontend can always clear session safely.
                logger.info("Logout received an invalid or already-blacklisted refresh token.")
                detail = "Session was already invalidated."
                already_invalid = True

        response = Response(
            {
                "detail": detail,
                "already_invalid": already_invalid,
            },
            status=status.HTTP_200_OK,
        )
        clear_refresh_cookie(response)
        return response
