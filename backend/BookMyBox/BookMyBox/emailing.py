# BookMyBox/emailing.py
"""Thin wrapper around Resend's HTTP API — the one place this codebase sends
real email, used by password reset (user app) and booking invites (bookings
app). Callers should go through tasks.send_email_task.delay(...), not this
function directly, so a slow/down Resend API never blocks a request thread.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = 'https://api.resend.com/emails'


def send_email(to, subject, html):
    """Send one email via Resend. Returns True if sent, False if skipped
    because no API key is configured (an expected, non-error condition in
    local dev — logs the content instead). Raises requests.RequestException
    on an actual send failure so callers (tasks.send_email_task) can retry;
    does not swallow that error itself."""
    if not settings.RESEND_API_KEY:
        logger.info("RESEND_API_KEY not set — skipping send, logging instead. to=%s subject=%r", to, subject)
        return False

    response = requests.post(
        RESEND_API_URL,
        headers={'Authorization': f'Bearer {settings.RESEND_API_KEY}'},
        json={
            'from': settings.DEFAULT_FROM_EMAIL,
            'to': [to],
            'subject': subject,
            'html': html,
        },
        timeout=10,
    )
    response.raise_for_status()
    return True
