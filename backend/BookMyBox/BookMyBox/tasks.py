# BookMyBox/tasks.py
"""Celery tasks shared across apps — currently just outbound email, kept
here (rather than in `user` or `bookings`) since both apps need it and
neither owns it. Mirrors bookings/tasks.py's retry shape."""
import logging

from celery import shared_task

from . import emailing

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_email_task(self, to, subject, html):
    try:
        emailing.send_email(to, subject, html)
    except Exception as exc:
        logger.warning("send_email_task retrying (attempt %d) for to=%s: %s", self.request.retries + 1, to, exc)
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))
