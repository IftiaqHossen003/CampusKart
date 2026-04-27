from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


@database_sync_to_async
def _get_user(user_id: int):
    User = get_user_model()
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTQueryHeaderAuthMiddleware:
    """Populate scope user from JWT in query-string token or Authorization header."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)

        existing_user = scope.get("user")
        token = self._extract_token(scope)

        if token:
            scope["user"] = await self._resolve_user_from_token(token)
        elif not existing_user:
            scope["user"] = AnonymousUser()

        return await self.inner(scope, receive, send)

    @staticmethod
    def _extract_token(scope) -> str | None:
        query_string = scope.get("query_string", b"").decode("utf-8")
        query = parse_qs(query_string)

        query_token = query.get("token", [None])[0]
        if query_token:
            return query_token

        for header_name, header_value in scope.get("headers", []):
            if header_name.lower() != b"authorization":
                continue
            auth_value = header_value.decode("utf-8")
            if auth_value.lower().startswith("bearer "):
                return auth_value.split(" ", 1)[1].strip()

        return None

    async def _resolve_user_from_token(self, token: str):
        try:
            validated = AccessToken(token)
            user_id = int(validated["user_id"])
        except (KeyError, TypeError, ValueError, TokenError):
            return AnonymousUser()

        return await _get_user(user_id)
