from django.urls import path

from .views import (
    RegisterView,
    LoginView,
    TokenRefreshView,
    VerifyEmailView,
    ResendVerificationView,
    MeView,
    ChangePasswordView,
    LogoutView,
)

app_name = "auth"

urlpatterns = [
    # Registration & verification
    path("register/",             RegisterView.as_view(),            name="register"),
    path("verify-email/",         VerifyEmailView.as_view(),         name="verify-email"),
    path("resend-verification/",  ResendVerificationView.as_view(),  name="resend-verification"),

    # JWT auth
    path("login/",                LoginView.as_view(),               name="login"),
    path("token/refresh/",        TokenRefreshView.as_view(),        name="token-refresh"),
    path("logout/",               LogoutView.as_view(),              name="logout"),

    # Profile management
    path("me/",                   MeView.as_view(),                  name="me"),
    path("change-password/",      ChangePasswordView.as_view(),      name="change-password"),
]
