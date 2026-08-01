"""
WebSocket authentication for the slot reservation status stream.

This app authenticates over JWT bearer tokens (djangorestframework-simplejwt),
not Django sessions — so Channels' built-in AuthMiddlewareStack (which only
understands session cookies) doesn't apply here. Browsers also can't set an
Authorization header on a WebSocket handshake, so the client passes its
access token as a query string parameter instead (?token=...).
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def _get_user_from_token(token):
    User = get_user_model()
    try:
        validated = AccessToken(token)
        return User.objects.get(pk=validated['user_id'])
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        token = parse_qs(query_string).get('token', [None])[0]
        scope['user'] = await _get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
