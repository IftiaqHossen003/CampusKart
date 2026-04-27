"""WSGI config for CampusKart project."""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "CampusKart.settings.dev")

application = get_wsgi_application()
