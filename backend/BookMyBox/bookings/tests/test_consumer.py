"""
Verifies the JWT-over-WebSocket auth (bookings/ws_auth.py) and the
SlotStatusConsumer's connect/resync behavior against the real ASGI
application, using Channels' WebsocketCommunicator test helper.
"""

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import RefreshToken

from BookMyBox.asgi import application
from bookings import reservation
from boxes.models import Box

User = get_user_model()

PATH = "/ws/bookings/slot/1/2030-01-15/10:00/2/"


class SlotStatusConsumerAuthTests(TransactionTestCase):
    # TestCase's per-test savepoint-wrapped transaction doesn't mix cleanly
    # with database_sync_to_async's connection handling inside the JWT auth
    # middleware (a known Channels/Django rough edge) — TransactionTestCase's
    # real-commit-and-truncate semantics avoid the "Cannot operate on a
    # closed database" failures that produced across sequential async tests.
    def setUp(self):
        reservation.get_client().flushdb()
        self.user = User.objects.create_user(
            email='ws@example.com', username='ws@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        self.token = str(RefreshToken.for_user(self.user).access_token)

    def tearDown(self):
        reservation.get_client().flushdb()

    async def test_valid_token_connects_and_gets_idle_resync(self):
        communicator = WebsocketCommunicator(application, f"{PATH}?token={self.token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        message = await communicator.receive_json_from()
        self.assertEqual(message, {'type': 'idle'})
        await communicator.disconnect()

    async def test_missing_token_is_rejected(self):
        communicator = WebsocketCommunicator(application, PATH)
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_invalid_token_is_rejected(self):
        communicator = WebsocketCommunicator(application, f"{PATH}?token=not-a-real-token")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_resync_reports_held_status_for_own_hold_token(self):
        from asgiref.sync import sync_to_async

        result = await sync_to_async(reservation.reserve_slot)(
            box_id=1, date='2030-01-15', start_time='10:00', duration=2, user_id=self.user.id,
        )
        communicator = WebsocketCommunicator(
            application, f"{PATH}?token={self.token}&hold_token={result.hold_token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'held')
        self.assertIn('expires_at', message)
        await communicator.disconnect()
