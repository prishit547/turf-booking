"""
ASGI config for BookMyBox project.

Routes plain HTTP to the normal Django app and WebSocket connections to the
Channels routing defined in bookings/routing.py (the slot reservation
hold/queue status stream). See bookings/ws_auth.py for how WebSocket
connections are authenticated (this app uses JWT bearer tokens, not Django
sessions, so the standard Channels AuthMiddlewareStack doesn't apply).

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'BookMyBox.settings')

# Must be created before importing anything that touches the app registry
# (e.g. routing modules that import consumers, which import models).
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

import bookings.routing  # noqa: E402
from bookings.ws_auth import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddleware(URLRouter(bookings.routing.websocket_urlpatterns)),
})
