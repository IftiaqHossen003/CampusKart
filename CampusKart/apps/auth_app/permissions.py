"""
CampusKart custom DRF permission classes and role decorator.

Roles
-----
student  — registered campus student
vendor   — campus vendor whose VendorProfile.status == 'approved'
admin    — platform administrator

Permission classes
------------------
IsStudent          — authenticated + role == 'student'
IsVendor           — authenticated + role == 'vendor' + vendor approved
IsAdmin            — authenticated + role == 'admin'
IsOwnerOrAdmin     — object owner (obj == user | obj.user == user) OR admin

Decorator
---------
require_role(*roles) — class/function-based view decorator; raises 403 if the
                       authenticated user's role is not in the allowed set.

Example ViewSet usage
---------------------
    from rest_framework.viewsets import ModelViewSet
    from rest_framework.permissions import IsAuthenticated
    from apps.auth_app.permissions import IsVendor, IsOwnerOrAdmin, require_role

    class ProductViewSet(ModelViewSet):
        serializer_class = ProductSerializer
        queryset = Product.objects.all()

        def get_permissions(self):
            if self.action in ("create", "update", "partial_update", "destroy"):
                return [IsAuthenticated(), IsVendor()]
            return [IsAuthenticated()]

        def perform_create(self, serializer):
            serializer.save(vendor=self.request.user.vendor_profile)


    # ── Function-based view with decorator ──────────────────────────────────
    from rest_framework.decorators import api_view
    from apps.auth_app.permissions import require_role

    @api_view(["GET"])
    @require_role("vendor", "admin")
    def vendor_dashboard(request):
        return Response({"message": "Welcome, vendor!"})
"""

import functools
import logging

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_authenticated(request: Request) -> bool:
    """Return True if the request carries a valid authenticated user."""
    return bool(request.user and request.user.is_authenticated)


def _vendor_is_approved(user) -> bool:
    """
    Return True if the user has an associated VendorProfile with status='approved'.
    Safely handles missing VendorProfile (raises no exceptions).
    """
    try:
        return user.vendor_profile.status == "approved"
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Permission classes
# ---------------------------------------------------------------------------

class IsStudent(BasePermission):
    """
    Grants access only to authenticated users whose role is 'student'.

    Usage
    -----
        permission_classes = [IsAuthenticated, IsStudent]
    """

    message = "Access restricted to students only."

    def has_permission(self, request: Request, view) -> bool:
        return _is_authenticated(request) and request.user.role == "student"


class IsVendor(BasePermission):
    """
    Grants access only to authenticated users whose:
      - role == 'vendor'
      - VendorProfile.status == 'approved'

    Unapproved / pending vendors are explicitly rejected with a descriptive message.

    Usage
    -----
        permission_classes = [IsAuthenticated, IsVendor]
    """

    message = "Access restricted to approved vendors only."

    def has_permission(self, request: Request, view) -> bool:
        if not _is_authenticated(request):
            return False
        if request.user.role != "vendor":
            self.message = "Access restricted to vendors only."
            return False
        if not _vendor_is_approved(request.user):
            self.message = (
                "Your vendor account is not yet approved. "
                "Please wait for admin approval."
            )
            return False
        return True


class IsAdmin(BasePermission):
    """
    Grants access only to authenticated users whose role is 'admin'.

    Note: Django superusers with role != 'admin' are NOT granted access.
    Use Django's built-in IsAdminUser if you need is_staff-based checks.

    Usage
    -----
        permission_classes = [IsAuthenticated, IsAdmin]
    """

    message = "Access restricted to administrators only."

    def has_permission(self, request: Request, view) -> bool:
        return _is_authenticated(request) and request.user.role == "admin"


class IsOwnerOrAdmin(BasePermission):
    """
    Object-level permission.

    Grants access when:
      - request.user.role == 'admin'  OR
      - obj IS request.user            (the object itself is the user)  OR
      - obj.user == request.user       (the object has a .user FK/O2O

    Unauthenticated requests always fail.

    Usage
    -----
        permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

        # In your ViewSet / APIView:
        def get_object(self):
            obj = super().get_object()
            self.check_object_permissions(self.request, obj)
            return obj
    """

    message = "You do not have permission to access this resource."

    def has_permission(self, request: Request, view) -> bool:
        return _is_authenticated(request)

    def has_object_permission(self, request: Request, view, obj) -> bool:
        if not _is_authenticated(request):
            return False

        # Admins bypass ownership checks
        if request.user.role == "admin":
            return True

        # Object IS the user (e.g., CustomUser instance)
        if obj == request.user:
            return True

        # Object has a .user attribute (FK / OneToOne to the user)
        owner = getattr(obj, "user", None)
        if owner is not None and owner == request.user:
            return True

        return False


# ---------------------------------------------------------------------------
# require_role decorator
# ---------------------------------------------------------------------------

def require_role(*roles: str):
    """
    View decorator (works on both APIView methods and @api_view functions)
    that restricts access to users whose role is in the given set.

    Raises ``PermissionDenied`` (HTTP 403) for authenticated users with the
    wrong role, and returns HTTP 401 for unauthenticated requests via DRF's
    standard authentication flow.

    Parameters
    ----------
    *roles : str
        One or more of 'student', 'vendor', 'admin'.

    Examples
    --------
    Function-based view::

        @api_view(["GET"])
        @require_role("vendor", "admin")
        def my_view(request):
            ...

    Class-based view method::

        class MyView(APIView):
            @require_role("admin")
            def delete(self, request, pk):
                ...
    """
    allowed = frozenset(roles)

    def decorator(view_func):
        @functools.wraps(view_func)
        def wrapper(request_or_self, *args, **kwargs):
            # Support both function views (request as 1st arg)
            # and class-based views (self as 1st arg, request as 2nd)
            if hasattr(request_or_self, "user"):
                # Function-based: first arg is the DRF Request
                request = request_or_self
            else:
                # Class-based: second positional arg is the DRF Request
                request = args[0] if args else None

            if request is None or not _is_authenticated(request):
                # Let DRF's authentication/permission chain handle 401
                raise PermissionDenied("Authentication credentials were not provided.")

            if request.user.role not in allowed:
                raise PermissionDenied(
                    f"This action requires one of the following roles: "
                    f"{', '.join(sorted(allowed))}. "
                    f"Your role is '{request.user.role}'."
                )

            return view_func(request_or_self, *args, **kwargs)

        return wrapper

    return decorator
