"""
Development settings — extends base.py.
"""

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# ---------------------------------------------------------------------------
# Development-only apps
# ---------------------------------------------------------------------------
INSTALLED_APPS += [  # noqa: F405
    "debug_toolbar",
]

MIDDLEWARE = [  # noqa: F405
    "debug_toolbar.middleware.DebugToolbarMiddleware",
] + MIDDLEWARE  # noqa: F405

INTERNAL_IPS = ["127.0.0.1"]

# ---------------------------------------------------------------------------
# Email — use console backend in dev
# ---------------------------------------------------------------------------
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# ---------------------------------------------------------------------------
# Database — honour POSTGRES_HOST env var (defaults to localhost for local
# dev; docker-compose overrides it to 'db' via the x-django-env anchor)
# ---------------------------------------------------------------------------
# No hardcoded HOST override — base.py already reads POSTGRES_HOST from env.

# ---------------------------------------------------------------------------
# CORS — allow everything locally
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = True

# ---------------------------------------------------------------------------
# Django shell / runserver niceties
# ---------------------------------------------------------------------------
SHELL_PLUS_PRINT_SQL = True
