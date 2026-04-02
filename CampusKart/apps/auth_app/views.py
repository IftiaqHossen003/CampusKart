"""
Views for auth_app.
All endpoints live under /api/v1/auth/
"""

from django.contrib.auth import get_user_model
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView as BaseTokenRefreshView,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OTP
from .serializers import (
    CustomUserSerializer,
    RegisterSerializer,
    LoginSerializer,
    VerifyEmailSerializer,
    ChangePasswordSerializer,
)
from .tasks import send_verification_email

User = get_user_model()


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
        except Exception:
            return Response(
                {"detail": "Token is invalid or already blacklisted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)
