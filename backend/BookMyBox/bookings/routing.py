from django.urls import re_path

from . import consumers

# Slot signature components in the URL, mirroring reservation.slot_signature()'s
# (box_id, date, start_time, duration) shape. hold_token (if the client has
# one) travels as a query param instead — see consumers.SlotStatusConsumer.
websocket_urlpatterns = [
    re_path(
        r'^ws/bookings/slot/(?P<box_id>\d+)/(?P<date>\d{4}-\d{2}-\d{2})/(?P<start_time>\d{2}:\d{2})/(?P<duration>\d+)/$',
        consumers.SlotStatusConsumer.as_asgi(),
    ),
]
