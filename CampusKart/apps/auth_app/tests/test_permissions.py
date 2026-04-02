"""
Unit tests for apps/auth_app/permissions.py

Tests use lightweight mock objects — no database hits required.
Run with:
    docker compose exec django python manage.py test apps.auth_app.tests.test_permissions
"""

from unittest.mock import MagicMock, PropertyMock, patch

from django.test import TestCase
from rest_framework.exceptions import PermissionDenied

from apps.auth_app.permissions import (
    IsAdmin,
    IsOwnerOrAdmin,
    IsStudent,
    IsVendor,
    require_role,
)


# ---------------------------------------------------------------------------
# Helpers — build mock Request / User objects without hitting the DB
# ---------------------------------------------------------------------------

def _make_user(
    role: str = "student",
    is_authenticated: bool = True,
    is_active: bool = True,
    vendor_status: str | None = None,
) -> MagicMock:
    """Return a mock CustomUser with the given attributes."""
    user = MagicMock()
    user.role = role
    user.is_active = is_active
    # is_authenticated is a property on AbstractBaseUser
    type(user).is_authenticated = PropertyMock(return_value=is_authenticated)

    if vendor_status is not None:
        vendor_profile = MagicMock()
        vendor_profile.status = vendor_status
        user.vendor_profile = vendor_profile
    else:
        # Accessing vendor_profile raises AttributeError (no profile)
        user.vendor_profile = MagicMock(side_effect=AttributeError)
        del user.vendor_profile  # make attribute access raise AttributeError

    return user


def _make_request(user: MagicMock) -> MagicMock:
    """Return a mock DRF Request wrapping the given user."""
    request = MagicMock()
    request.user = user
    return request


# ---------------------------------------------------------------------------
# IsStudent
# ---------------------------------------------------------------------------

class IsStudentTests(TestCase):

    def setUp(self):
        self.permission = IsStudent()
        self.view = MagicMock()

    def test_student_user_passes(self):
        request = _make_request(_make_user(role="student"))
        self.assertTrue(self.permission.has_permission(request, self.view))

    def test_vendor_user_fails(self):
        request = _make_request(_make_user(role="vendor"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_admin_user_fails(self):
        request = _make_request(_make_user(role="admin"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_unauthenticated_fails(self):
        request = _make_request(_make_user(role="student", is_authenticated=False))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_anonymous_user_fails(self):
        """request.user is AnonymousUser (falsy, not authenticated)."""
        request = MagicMock()
        request.user = None
        self.assertFalse(self.permission.has_permission(request, self.view))


# ---------------------------------------------------------------------------
# IsVendor
# ---------------------------------------------------------------------------

class IsVendorTests(TestCase):

    def setUp(self):
        self.permission = IsVendor()
        self.view = MagicMock()

    def test_approved_vendor_passes(self):
        request = _make_request(_make_user(role="vendor", vendor_status="approved"))
        self.assertTrue(self.permission.has_permission(request, self.view))

    def test_pending_vendor_fails(self):
        request = _make_request(_make_user(role="vendor", vendor_status="pending"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_suspended_vendor_fails(self):
        request = _make_request(_make_user(role="vendor", vendor_status="suspended"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_vendor_without_profile_fails(self):
        """Vendor role but no VendorProfile row at all."""
        user = _make_user(role="vendor")
        # Simulate DoesNotExist / RelatedObjectDoesNotExist
        type(user).vendor_profile = PropertyMock(side_effect=Exception("no profile"))
        request = _make_request(user)
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_student_user_fails(self):
        request = _make_request(_make_user(role="student"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_admin_user_fails(self):
        request = _make_request(_make_user(role="admin"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_unauthenticated_fails(self):
        request = _make_request(_make_user(role="vendor", is_authenticated=False, vendor_status="approved"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_error_message_unapproved(self):
        """The permission message should mention approval when role is vendor."""
        request = _make_request(_make_user(role="vendor", vendor_status="pending"))
        self.permission.has_permission(request, self.view)
        self.assertIn("approved", self.permission.message.lower())

    def test_error_message_wrong_role(self):
        """The permission message should mention vendor-only when role is wrong."""
        request = _make_request(_make_user(role="student"))
        self.permission.has_permission(request, self.view)
        self.assertIn("vendor", self.permission.message.lower())


# ---------------------------------------------------------------------------
# IsAdmin
# ---------------------------------------------------------------------------

class IsAdminTests(TestCase):

    def setUp(self):
        self.permission = IsAdmin()
        self.view = MagicMock()

    def test_admin_user_passes(self):
        request = _make_request(_make_user(role="admin"))
        self.assertTrue(self.permission.has_permission(request, self.view))

    def test_student_fails(self):
        request = _make_request(_make_user(role="student"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_vendor_fails(self):
        request = _make_request(_make_user(role="vendor", vendor_status="approved"))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_unauthenticated_fails(self):
        request = _make_request(_make_user(role="admin", is_authenticated=False))
        self.assertFalse(self.permission.has_permission(request, self.view))

    def test_superuser_without_admin_role_fails(self):
        """
        is_superuser=True alone does NOT grant access — role must be 'admin'.
        Ensures we rely on our role system, not Django's is_staff/is_superuser.
        """
        user = _make_user(role="student")
        user.is_superuser = True
        user.is_staff = True
        request = _make_request(user)
        self.assertFalse(self.permission.has_permission(request, self.view))


# ---------------------------------------------------------------------------
# IsOwnerOrAdmin
# ---------------------------------------------------------------------------

class IsOwnerOrAdminTests(TestCase):

    def setUp(self):
        self.permission = IsOwnerOrAdmin()
        self.view = MagicMock()

    # ── has_permission (view-level) ──────────────────────────────────────────

    def test_authenticated_passes_view_level(self):
        request = _make_request(_make_user(role="student"))
        self.assertTrue(self.permission.has_permission(request, self.view))

    def test_unauthenticated_fails_view_level(self):
        request = _make_request(_make_user(is_authenticated=False))
        self.assertFalse(self.permission.has_permission(request, self.view))

    # ── has_object_permission ────────────────────────────────────────────────

    def test_admin_can_access_any_object(self):
        user = _make_user(role="admin")
        request = _make_request(user)
        obj = MagicMock()  # any arbitrary object
        self.assertTrue(self.permission.has_object_permission(request, self.view, obj))

    def test_owner_is_user_object(self):
        """obj IS request.user (e.g., viewing own CustomUser record)."""
        user = _make_user(role="student")
        request = _make_request(user)
        self.assertTrue(self.permission.has_object_permission(request, self.view, user))

    def test_owner_via_user_fk(self):
        """obj.user == request.user (e.g., own Order, own Review)."""
        user = _make_user(role="student")
        request = _make_request(user)
        obj = MagicMock()
        obj.user = user
        self.assertTrue(self.permission.has_object_permission(request, self.view, obj))

    def test_non_owner_is_blocked(self):
        """Different user trying to access another user's resource."""
        user = _make_user(role="student")
        other_user = _make_user(role="student")
        request = _make_request(user)
        obj = MagicMock()
        obj.user = other_user
        self.assertFalse(self.permission.has_object_permission(request, self.view, obj))

    def test_object_without_user_attr_blocked(self):
        """Object has no .user attribute and is not the user itself."""
        user = _make_user(role="student")
        request = _make_request(user)
        obj = MagicMock(spec=[])  # spec=[] means no attributes
        self.assertFalse(self.permission.has_object_permission(request, self.view, obj))

    def test_unauthenticated_blocked_at_object_level(self):
        request = _make_request(_make_user(is_authenticated=False))
        obj = MagicMock()
        self.assertFalse(self.permission.has_object_permission(request, self.view, obj))


# ---------------------------------------------------------------------------
# require_role decorator
# ---------------------------------------------------------------------------

class RequireRoleDecoratorTests(TestCase):

    # ── Passing cases ────────────────────────────────────────────────────────

    def test_correct_role_passes(self):
        @require_role("vendor")
        def view(request):
            return "ok"

        request = _make_request(_make_user(role="vendor"))
        self.assertEqual(view(request), "ok")

    def test_multiple_allowed_roles_any_passes(self):
        @require_role("vendor", "admin")
        def view(request):
            return "ok"

        for role in ("vendor", "admin"):
            with self.subTest(role=role):
                request = _make_request(_make_user(role=role))
                self.assertEqual(view(request), "ok")

    # ── Failing cases ────────────────────────────────────────────────────────

    def test_wrong_role_raises_403(self):
        @require_role("admin")
        def view(request):
            return "ok"

        request = _make_request(_make_user(role="student"))
        with self.assertRaises(PermissionDenied) as ctx:
            view(request)
        self.assertIn("admin", str(ctx.exception.detail))

    def test_unauthenticated_raises_403(self):
        @require_role("admin")
        def view(request):
            return "ok"

        request = _make_request(_make_user(role="admin", is_authenticated=False))
        with self.assertRaises(PermissionDenied):
            view(request)

    def test_decorator_preserves_function_metadata(self):
        """functools.wraps should preserve the original function's name and docs."""
        @require_role("admin")
        def my_special_view(request):
            """My docstring."""
            return "ok"

        self.assertEqual(my_special_view.__name__, "my_special_view")
        self.assertEqual(my_special_view.__doc__, "My docstring.")

    def test_decorator_on_class_based_view_method(self):
        """
        When used on a CBV method, the first arg is self (the view instance)
        and the second arg is the DRF Request.
        """
        class FakeView:
            @require_role("admin")
            def get(self, request):
                return "cbv_ok"

        view_instance = FakeView()
        request = _make_request(_make_user(role="admin"))
        self.assertEqual(view_instance.get(request), "cbv_ok")

    def test_decorator_cbv_wrong_role_raises_403(self):
        class FakeView:
            @require_role("admin")
            def get(self, request):
                return "cbv_ok"

        view_instance = FakeView()
        request = _make_request(_make_user(role="student"))
        with self.assertRaises(PermissionDenied):
            view_instance.get(request)
