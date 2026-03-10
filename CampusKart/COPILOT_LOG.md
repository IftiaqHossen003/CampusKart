# CampusKart — Copilot Action & Error Log

> All changes, fixes and decisions made by GitHub Copilot during development.
> Updated incrementally as work progresses.

---

## Session 1 — Project Scaffolding

**Date:** March 4, 2026
**Request:** Set up a full Django REST Framework project called CampusKart.

### Actions Taken

- Created `CampusKart/settings/` package with `base.py`, `dev.py`, `prod.py`
- Created 8 Django apps under `apps/`: `auth_app`, `vendors`, `products`, `orders`, `payments`, `chat`, `notifications`, `reviews`
- Each app received: `models.py`, `serializers.py`, `views.py`, `urls.py`, `admin.py`, `apps.py`
- Created `CampusKart/celery.py` and updated `CampusKart/__init__.py` to expose `celery_app`
- Updated `CampusKart/asgi.py` with Django Channels `ProtocolTypeRouter`
- Updated `CampusKart/urls.py` to include all 8 app routers + OpenAPI (drf-spectacular)
- Created `docker-compose.yml` with services: `db`, `redis`, `django`, `daphne`, `celery`, `celery-beat`
- Created `Dockerfile` using `python:3.12-slim`
- Created `requirements.txt` with all dependencies
- Created `.env.example` with all required environment variable keys
- Created `.gitignore`
- Updated `manage.py` to use `CampusKart.settings.dev`

---

## Session 2 — Credentials & INSTALLED_APPS Fix

**Date:** March 4, 2026
**Request:** Ensure all files are error-free; DB = `campuskart_db`, user = `postgres`, password = `tamim01815`.

### Actions Taken

- Updated `CampusKart/settings/base.py` — DB defaults aligned to `campuskart_db / postgres / tamim01815`
- Updated `.env.example` — DB credentials updated to match
- Added `django_filters` and `channels` to `THIRD_PARTY_APPS` in `settings/base.py` (were missing)

---

## Session 3 — Docker Networking Fix

**Date:** March 4, 2026
**Request:** Fix "connection refused on localhost:5432" when running `docker compose up`.

### Error

```
celery-beat | psycopg.OperationalError: connection refused on localhost:5432
```

### Root Cause

`settings/dev.py` had a hardcoded `.update()` block:

```python
DATABASES["default"].update({"HOST": "localhost", "PORT": "5432"})
```

This overrode the `POSTGRES_HOST=db` environment variable injected by docker-compose, causing all services to try connecting to `localhost` instead of the `db` Docker service.

### Fix

Removed the hardcoded `DATABASES["default"].update(...)` block from `settings/dev.py`.
Database config now reads exclusively from environment variables via `settings/base.py`.

---

## Session 4 — auth_app Full Rewrite

**Date:** March 4, 2026
**Request:** Comprehensive auth_app rework with custom user model, JWT auth, email verification via OTP.

### Files Rewritten

#### `apps/auth_app/models.py`

- `CustomUserManager` — `create_user()`, `create_superuser()`, queryset helpers (`.active()`, `.students()`, `.vendors()`)
- `CustomUser(AbstractBaseUser, PermissionsMixin)` — `USERNAME_FIELD = "email"`, `REQUIRED_FIELDS = ["full_name"]`, fields: email, full_name, phone, avatar, role, is_active, is_staff, is_verified, timestamps. DB table: `users`
- DB indexes added: `email`, `role`, `is_active`, composite `(role, is_active)`
- `StudentProfile` — OneToOne to CustomUser, fields: student_id, university, department, id_document_url, is_id_verified. DB table: `student_profiles`
- `OTP` — ForeignKey to CustomUser, auto-generated 6-digit code via `secrets.randbelow`, purpose choices (email_verify / password_reset), `is_expired` property, `verify(code)` using `secrets.compare_digest`. DB table: `otps`

#### `apps/auth_app/serializers.py`

- `CustomUserSerializer` — read representation with nested `StudentProfileSerializer`
- `RegisterSerializer` — validates student fields only when `role=student`, creates user + StudentProfile
- `LoginSerializer(TokenObtainPairSerializer)` — custom JWT claims: email, role, full_name, is_verified
- `VerifyEmailSerializer` — validates OTP, marks used, returns user in `attrs`
- `ChangePasswordSerializer` — validates old password, saves new

#### `apps/auth_app/views.py`

- `RegisterView` — creates user, calls `send_verification_email.delay(user.pk)`, returns 201
- `LoginView(TokenObtainPairView)` — uses `LoginSerializer`
- `TokenRefreshView` — wraps `BaseTokenRefreshView`
- `VerifyEmailView` — marks `is_verified=True`, issues fresh JWT tokens
- `ResendVerificationView` — anti-enumeration (always 200), retriggers Celery task
- `MeView` — GET / PATCH own profile
- `ChangePasswordView` — PATCH only
- `LogoutView` — blacklists refresh token via `RefreshToken(token).blacklist()`

#### `apps/auth_app/urls.py`

9 URL patterns under `app_name = "auth"`:
`register/`, `verify-email/`, `resend-verification/`, `login/`, `token/refresh/`, `logout/`, `me/`, `change-password/`

#### `apps/auth_app/admin.py`

- `CustomUserAdmin` with `StudentProfileInline`, avatar preview, bulk verify/deactivate actions
- `StudentProfileAdmin` with `is_id_verified` editable in list view
- `OTPAdmin` with computed `is_expired_display` column

#### `apps/auth_app/tasks.py` _(new file)_

- `send_verification_email(user_id)` — invalidates old OTPs, creates fresh OTP, sends HTML + plain-text email, retries up to 3× with exponential back-off
- `send_password_reset_email(user_id)` — same pattern for password reset flow

### Settings Update

- `CampusKart/settings/base.py` — `AUTH_USER_MODEL` changed from `"auth_app.User"` → `"auth_app.CustomUser"`

---

## Session 5 — Docker Startup Errors & Migrations

**Date:** March 4, 2026
**Request:** Run the project with Docker — containers were not starting.

### Error 1 — Wrong Directory

```
no configuration file provided: not found
```

**Cause:** `docker compose` was run from `F:\CampusKart\CampusKart\` instead of `F:\CampusKart\CampusKart\CampusKart\` where `docker-compose.yml` lives.
**Fix:** `cd F:\CampusKart\CampusKart\CampusKart` before running docker commands.

---

### Error 2 — Django 6.0 `CheckConstraint` API Change

```
TypeError: CheckConstraint.__init__() got an unexpected keyword argument 'check'
```

**Cause:** `requirements.txt` specifies `Django>=5.0,<6.1`, so pip resolved Django 6.0.3. In Django 6.0, `CheckConstraint(check=...)` was renamed to `CheckConstraint(condition=...)`.

**File:** `apps/reviews/models.py` line 31

**Fix:**

```python
# Before (Django <6.0)
models.CheckConstraint(
    check=(models.Q(product__isnull=False) | models.Q(vendor__isnull=False)),
    name="review_must_target_product_or_vendor",
)

# After (Django 6.0+)
models.CheckConstraint(
    condition=(models.Q(product__isnull=False) | models.Q(vendor__isnull=False)),
    name="review_must_target_product_or_vendor",
)
```

---

### Error 3 — No Migrations Existed

```
django.db.utils.ProgrammingError: relation "users" does not exist
```

**Cause:** No migration files existed for any app. Django's startup command (`migrate --noinput`) failed because the `users` table referenced by other apps didn't exist.

**Fix:** Created initial migrations for all apps:

```bash
docker compose run --rm --no-deps django python manage.py makemigrations auth_app
docker compose run --rm --no-deps django python manage.py makemigrations vendors products orders payments chat notifications reviews
docker compose run --rm django python manage.py migrate
```

**Migration files created:**
| App | File |
|-----|------|
| auth_app | `apps/auth_app/migrations/0001_initial.py` |
| vendors | `apps/vendors/migrations/0001_initial.py` |
| products | `apps/products/migrations/0001_initial.py` |
| orders | `apps/orders/migrations/0001_initial.py` |
| payments | `apps/payments/migrations/0001_initial.py` |
| chat | `apps/chat/migrations/0001_initial.py` |
| notifications | `apps/notifications/migrations/0001_initial.py` |
| reviews | `apps/reviews/migrations/0001_initial.py` |

---

### Final State — All Services Running

```
campuskart-django-1      Up
campuskart-daphne-1      Up
campuskart-celery-1      Up
campuskart-celery-beat-1 Up
campuskart-db-1          Up (healthy)
campuskart-redis-1       Up (healthy)
```

---

## Session 6 — 404 on Port 8001 Explained

**Date:** March 4, 2026
**Question:** `http://localhost:8001/` returns 404 Page Not Found — why?

**Explanation:** Port 8001 is the **Daphne/ASGI server** dedicated to WebSocket connections only. There is no HTTP root route at `/` — this is expected and not an error.

| Service           | Port | Purpose                  |
| ----------------- | ---- | ------------------------ |
| Gunicorn (Django) | 8000 | REST API, Admin, Swagger |
| Daphne (ASGI)     | 8001 | WebSockets only          |

**Correct URLs:**

- REST API: http://localhost:8000/api/v1/
- Swagger UI: http://localhost:8000/api/docs/
- ReDoc: http://localhost:8000/api/redoc/
- Django Admin: http://localhost:8000/admin/
- WebSocket: `ws://localhost:8001/ws/chat/<room_id>/`

---

## Session 7 — Custom Permission Classes & Role Decorator

**Date:** March 4, 2026
**Request:** DRF permission classes for 3 roles (student, vendor, admin) + `require_role` decorator + unit tests + example ViewSet usage.

### Files Created

#### `apps/auth_app/permissions.py`

Four permission classes and one decorator:

| Class / Decorator      | Logic                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `IsStudent`            | `is_authenticated` + `role == 'student'`                                                               |
| `IsVendor`             | `is_authenticated` + `role == 'vendor'` + `vendor_profile.status == 'approved'`                        |
| `IsAdmin`              | `is_authenticated` + `role == 'admin'`                                                                 |
| `IsOwnerOrAdmin`       | View-level: `is_authenticated`. Object-level: `role == 'admin'` OR `obj == user` OR `obj.user == user` |
| `require_role(*roles)` | Decorator (FBV + CBV); raises `PermissionDenied` (HTTP 403) if user's role not in allowed set          |

Key design decisions:

- `IsVendor` explicitly handles missing `VendorProfile` (no profile = denied, with safe exception handling)
- `IsVendor` sets a descriptive `self.message` depending on failure reason (wrong role vs unapproved)
- `IsAdmin` intentionally does NOT check `is_staff`/`is_superuser` — role-based only
- `IsOwnerOrAdmin` supports both `obj == user` (user resource) and `obj.user == user` (FK ownership)
- `require_role` uses `functools.wraps` to preserve function metadata

Example usage in a ViewSet:

```python
from apps.auth_app.permissions import IsVendor, IsOwnerOrAdmin, require_role

class ProductViewSet(ModelViewSet):
    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsVendor()]
        return [IsAuthenticated()]

@api_view(["GET"])
@require_role("vendor", "admin")
def vendor_dashboard(request):
    return Response({"message": "Welcome!"})
```

#### `apps/auth_app/tests/__init__.py`

Empty package init — makes `tests/` a proper Python package.

#### `apps/auth_app/tests/test_permissions.py`

27 test methods across 5 test classes (34 total sub-tests including `subTest` iterations). All tests use mock objects (no DB required).

| Test Class                  | Tests | What's covered                                                                                                      |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `IsStudentTests`            | 5     | Correct role, wrong roles, unauthenticated, anonymous                                                               |
| `IsVendorTests`             | 8     | Approved/pending/suspended/no-profile, wrong roles, unauthenticated, error messages                                 |
| `IsAdminTests`              | 5     | Admin passes, other roles fail, superuser without admin role fails                                                  |
| `IsOwnerOrAdminTests`       | 8     | Admin bypass, obj-is-user, obj.user FK, non-owner blocked, no-user-attr, unauthenticated                            |
| `RequireRoleDecoratorTests` | 7     | Single role, multiple roles, wrong role → 403, unauthenticated → 403, `functools.wraps`, CBV method, CBV wrong role |

Run tests:

```bash
docker compose exec django python manage.py test apps.auth_app.tests.test_permissions
```

---

## Architecture Reference

### Project Structure

```
CampusKart/                   ← repo root
└── CampusKart/               ← Django project root (docker-compose.yml lives here)
    ├── apps/
    │   ├── auth_app/
    │   ├── vendors/
    │   ├── products/
    │   ├── orders/
    │   ├── payments/
    │   ├── chat/
    │   ├── notifications/
    │   └── reviews/
    ├── CampusKart/           ← Django package
    │   ├── settings/
    │   │   ├── base.py
    │   │   ├── dev.py
    │   │   └── prod.py
    │   ├── celery.py
    │   ├── asgi.py
    │   ├── wsgi.py
    │   └── urls.py
    ├── Dockerfile
    ├── docker-compose.yml
    ├── requirements.txt
    └── .env.example
```

### Key Settings

| Setting                  | Value                     |
| ------------------------ | ------------------------- |
| `AUTH_USER_MODEL`        | `auth_app.CustomUser`     |
| `DJANGO_SETTINGS_MODULE` | `CampusKart.settings.dev` |
| DB name                  | `campuskart_db`           |
| DB user                  | `postgres`                |
| DB password              | `tamim01815`              |
| DB host (Docker)         | `db`                      |
| Redis URL                | `redis://redis:6379/0`    |
| Celery broker            | `redis://redis:6379/1`    |

---

## Session 8 — Multi-Vendor Product Model Upgrade

**Date:** March 6, 2026  
**Request:** Build vendor/product system models with approval workflow, tags, images, composite indexes, `get_absolute_url`, and generate migrations.

### Actions Taken

- Reworked `apps/vendors/models.py`:
- Added/updated fields: `shop_slug` (unique), `logo_url`, `banner_url`, `contact_email`, `contact_phone`, `address`, `commission_rate`, `total_earnings`, `approved_by`, `approved_at`
- Kept role/status workflow with `pending/approved/suspended`
- Added `get_absolute_url()` and retained `__str__()`

- Reworked `apps/products/models.py`:
- `Category`: added `icon_url`, `is_active`, `parent` support, `get_absolute_url()`
- `Product`: added `discount_price`, `sku`, `status`, `approved_by`, `approved_at`, `total_sold`, `avg_rating`
- Added composite indexes:
  - `(status, category, created_at)`
  - `(vendor, status)`
- `ProductImage`: moved to URL-based image storage (`image_url`) + `sort_order`
- Added `ProductTag` model (`product`, `tag`) with uniqueness per product
- Added `__str__()` and `get_absolute_url()` on applicable models

### Compatibility Fixes Needed During Startup

The app initially entered a Django restart loop because old code still referenced removed fields (`is_active`, `condition`, `college`, `is_featured`, etc.).

Updated to match new schemas:

- `apps/products/views.py` (status-based filtering)
- `apps/products/serializers.py` (new fields + tag serializer)
- `apps/products/admin.py` (new list/filter fields)
- `apps/vendors/serializers.py` (new vendor profile fields)
- `apps/vendors/views.py` (new search/order fields)
- `apps/vendors/admin.py` (new admin fields)

### Migrations Generated (Docker)

Used one-off container command to avoid service restart loop while generating migrations:

```bash
docker compose run --rm --no-deps django python manage.py makemigrations vendors products --skip-checks --no-input
```

Generated files:

- `apps/vendors/migrations/0002_remove_vendorprofile_banner_and_more.py`
- `apps/products/migrations/0002_producttag_alter_productimage_options_and_more.py`

Notes:

- To avoid non-null migration prompts for existing rows, `shop_slug`, `sku`, and `image_url` were made nullable during this migration step.

---

## Session 9 — Settings Redundancy Cleanup

**Date:** March 10, 2026  
**Request:** Verify which settings source is active and remove redundant settings files; scan for similar redundancy.

### Findings

- Active Django settings source is the package path `CampusKart.settings.dev`.
- Confirmed references in:
  - `manage.py`
  - `CampusKart/asgi.py`
  - `CampusKart/wsgi.py`
  - `CampusKart/celery.py`
  - `.env`
  - `docker-compose.yml`
- `CampusKart/settings.py` was a deprecated leftover file and not used by runtime.

### Cleanup Performed

- Deleted: `CampusKart/settings.py`
- Redundancy sweep:
  - No extra `settings.py` files found
  - No `__pycache__` directories found
  - No backup/temp artifacts (`*.bak`, `*.old`, `*.tmp`, `*.orig`, `*.rej`) found

---

admin.campuskart@gmail.com
Admin@12345
_This file is maintained by GitHub Copilot. Updated: March 10, 2026._
