"""
Channels group-send helpers for the slot reservation WebSocket stream.
Kept separate from tasks.py (Celery-specific) and views.py (HTTP-specific)
since both need to publish the exact same event shapes.
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def group_name_for(sig):
    """Channels group names must match ^[a-zA-Z0-9-_.]{1,100}$ — a slot
    signature contains '|' (component delimiter) and ':' (from start_time's
    "HH:MM"), neither of which is allowed, so both get substituted."""
    safe = sig.replace('|', '.').replace(':', '-')
    return f"slot.{safe}"


def _send(sig, payload):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(group_name_for(sig), {
        'type': 'slot_update',
        'payload': payload,
    })


def broadcast_promoted(sig, new_user_id, expires_at):
    _send(sig, {'type': 'promoted', 'new_holder_user_id': new_user_id, 'expires_at': expires_at})


def broadcast_slot_released(sig):
    _send(sig, {'type': 'slot_released'})


def broadcast_slot_booked(sig, booked_by_user_id):
    # booked_by_user_id lets recipients tell "I just booked this myself"
    # apart from "someone else took it out from under me" — mirrors
    # broadcast_promoted's new_user_id, for the same reason (see that
    # function and useSlotReservation.js's 'promoted' handler).
    _send(sig, {'type': 'slot_booked', 'booked_by_user_id': booked_by_user_id})
