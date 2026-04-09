"""
Custom throttles for auth endpoints.
"""

from rest_framework.throttling import SimpleRateThrottle


class EmailIPRateThrottle(SimpleRateThrottle):
    """
    Build a cache key from client IP + normalized email.
    Falls back to IP-only when email is missing.
    """

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email = ""

        try:
            email = (request.data.get("email") or "").strip().lower()
        except Exception:
            email = ""

        unique_ident = f"{ident}:{email}" if email else ident
        return self.cache_format % {"scope": self.scope, "ident": unique_ident}


class ForgotPasswordThrottle(EmailIPRateThrottle):
    scope = "forgot_password"


class ResetPasswordThrottle(EmailIPRateThrottle):
    scope = "reset_password"
