"""ASGI config for CampusKart project."""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "CampusKart.settings.dev")

django_asgi_app = get_asgi_application()

# Import routing after Django setup to avoid AppRegistryNotReady
import apps.chat.routing  # noqa: E402
from apps.chat.middleware import JWTQueryHeaderAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            JWTQueryHeaderAuthMiddleware(URLRouter(apps.chat.routing.websocket_urlpatterns))
        ),
    }
)
