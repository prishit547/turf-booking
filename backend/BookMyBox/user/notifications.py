# user/notifications.py
"""The only place that should create a Notification row — a single plain
function, deliberately synchronous (no queue/Celery task), matching this
codebase's existing "keep it simple unless clearly valuable" precedent
(the admin-update audit trail is a log line, not a full audit-log model;
this is the same call for notifications).
"""

from .models import Notification


def notify(user, title, message, link=''):
    if user is None:
        return None
    return Notification.objects.create(user=user, title=title, message=message, link=link)
