from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from . import broadcasting, reservation


class SlotStatusConsumer(AsyncJsonWebsocketConsumer):
    """Pushes hold-countdown and queue-position updates for one exact slot
    signature (box_id/date/start_time/duration) to everyone currently
    holding or queued for it. Broadcasts are state-transition events only
    (see bookings/broadcasting.py) — the client computes its own live
    countdown from the expires_at timestamp rather than the server ticking
    every second over the wire."""

    async def connect(self):
        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            await self.close(code=4001)
            return

        kwargs = self.scope['url_route']['kwargs']
        self.sig = reservation.slot_signature(
            kwargs['box_id'], kwargs['date'], kwargs['start_time'], kwargs['duration']
        )
        self.group_name = broadcasting.group_name_for(self.sig)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self._send_resync()

    async def disconnect(self, code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def _send_resync(self):
        """A client that connects (or reconnects after a dropped connection)
        mid-hold or mid-queue needs its current state immediately, not just
        future updates — otherwise a page refresh would show stale 'idle'
        until the next state change happens to someone."""
        query_string = self.scope.get('query_string', b'').decode()
        hold_token = parse_qs(query_string).get('hold_token', [None])[0]
        if not hold_token:
            await self.send_json({'type': 'idle'})
            return

        status = await sync_to_async(reservation.get_hold_status)(hold_token)
        if not status.found:
            await self.send_json({'type': 'idle'})
        elif status.status == 'held':
            await self.send_json({'type': 'held', 'expires_at': status.expires_at})
        else:
            await self.send_json({'type': 'queued', 'position': status.position})

    async def slot_update(self, event):
        """Handler name matches the 'type' field group_send() dispatches on
        (see bookings/broadcasting.py) — Channels routes here automatically."""
        await self.send_json(event['payload'])
