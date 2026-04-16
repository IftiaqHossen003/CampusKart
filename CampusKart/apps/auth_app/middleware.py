from __future__ import annotations

import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


class ApiRateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _get_client_ip(request) -> str:
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")

    @staticmethod
    def _increment_bucket(bucket_key: str, timeout: int) -> int:
        if cache.add(bucket_key, 1, timeout=timeout):
            return 1

        try:
            return int(cache.incr(bucket_key))
        except Exception:
            cache.set(bucket_key, 1, timeout=timeout)
            return 1

    def __call__(self, request):
        limit = int(getattr(settings, "GLOBAL_API_RATELIMIT_PER_MINUTE", 300) or 300)
        window_seconds = int(getattr(settings, "GLOBAL_API_RATELIMIT_WINDOW_SECONDS", 60) or 60)

        path = request.path or ""
        if limit > 0 and path.startswith("/api/v1/"):
            principal = None
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                principal = f"user:{user.pk}"
            else:
                principal = f"ip:{self._get_client_ip(request)}"

            now = time.time()
            bucket = int(now // window_seconds)
            cache_key = f"ratelimit:api:v1:{principal}:{bucket}"
            try:
                current = self._increment_bucket(cache_key, timeout=window_seconds + 1)
            except Exception:
                return self.get_response(request)

            reset_at = (bucket + 1) * window_seconds
            retry_after = max(1, int(reset_at - now))
            remaining = max(0, limit - current)

            if current > limit:
                response = JsonResponse(
                    {
                        "detail": f"Request was throttled. Expected available in {retry_after} seconds.",
                        "code": "api_rate_limited",
                    },
                    status=429,
                )
                response["Retry-After"] = str(retry_after)
                response["X-RateLimit-Limit"] = str(limit)
                response["X-RateLimit-Remaining"] = "0"
                response["X-RateLimit-Reset"] = str(reset_at)
                return response

            response = self.get_response(request)
            response["X-RateLimit-Limit"] = str(limit)
            response["X-RateLimit-Remaining"] = str(remaining)
            response["X-RateLimit-Reset"] = str(reset_at)
            return response

        return self.get_response(request)
