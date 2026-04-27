from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = "Admin access is required."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return getattr(user, "role", None) == "admin"


class IsVendor(BasePermission):
    message = "Vendor access is required."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return getattr(user, "role", None) == "vendor"
