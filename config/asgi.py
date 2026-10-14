import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi_app = get_asgi_application()   # must run first: it loads Django's app registry

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

import streaming.routing

application = ProtocolTypeRouter({
    'http': django_asgi_app,                      # normal pages
    'websocket': AllowedHostsOriginValidator(     # blocks other websites from connecting
        AuthMiddlewareStack(                      # gives consumers self.scope['user'] from the session
            URLRouter(streaming.routing.websocket_urlpatterns)
        )
    ),
})