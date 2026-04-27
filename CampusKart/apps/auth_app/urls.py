from django.urls import path

from .views import (
    RegisterView,
    LoginView,
    TokenRefreshView,
    TokenVerifyView,
    SessionPolicyView,
<<<<<<< HEAD
    CsrfCookieView,
    BootstrapSessionView,
=======
>>>>>>> 8766e707e08953d49f6d53d75b211c81d25301cf
    VerifyEmailView,
    ResendVerificationView,
    ForgotPasswordView,
    ResetPasswordView,
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
    path("forgot-password/",      ForgotPasswordView.as_view(),      name="forgot-password"),
    path("reset-password/",       ResetPasswordView.as_view(),       name="reset-password"),

    # JWT auth
    path("login/",                LoginView.as_view(),               name="login"),
    path("token/refresh/",        TokenRefreshView.as_view(),        name="token-refresh"),
    path("token/verify/",         TokenVerifyView.as_view(),         name="token-verify"),
    path("session-policy/",       SessionPolicyView.as_view(),       name="session-policy"),
<<<<<<< HEAD
    path("csrf/",                 CsrfCookieView.as_view(),          name="csrf-cookie"),
    path("bootstrap/",            BootstrapSessionView.as_view(),    name="bootstrap-session"),
=======
>>>>>>> 8766e707e08953d49f6d53d75b211c81d25301cf
    path("logout/",               LogoutView.as_view(),              name="logout"),

    # Profile management
    path("me/",                   MeView.as_view(),                  name="me"),
    path("change-password/",      ChangePasswordView.as_view(),      name="change-password"),
]
