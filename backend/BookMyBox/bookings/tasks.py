from datetime import datetime, time

from celery import shared_task
from django.utils import timezone

from . import broadcasting, reservation


def promote_and_broadcast(result, sig):
    """Shared by the expiry task below and by views.py's release_hold/
    confirm-failure paths — whichever caller ends a hold, the promote-then-
    broadcast-then-reschedule sequence must be identical so the two trigger
    paths (TTL expiry vs. an explicit user/view action) can't drift apart."""
    if result.status == 'promoted':
        broadcasting.broadcast_promoted(sig, result.new_user_id, result.expires_at)
        expire_hold_task.apply_async(
            args=[result.new_hold_token],
            eta=reservation.expires_at_to_eta(result.expires_at),
        )
    elif result.status == 'drained':
        broadcasting.broadcast_slot_released(sig)
    # 'stale' -> no-op: this expiry/release was already superseded by
    # something else (an earlier release, a confirm, another expiry).


@shared_task(bind=True, max_retries=3)
def expire_hold_task(self, hold_token):
    """Scheduled once per hold via apply_async(eta=...) at the moment a hold
    is created or a promotion occurs — never a periodic/beat task. Firing
    this recursively (via promote_and_broadcast rescheduling the next
    holder's own expiry) is what makes the queue cascade: hold expires ->
    promote next -> schedule their expiry -> they expire too -> ... until
    someone confirms or the queue drains."""
    meta = reservation.get_holdmeta(hold_token)
    if meta is None:
        return  # already fully cleaned up (confirmed/released/GC'd) — nothing to do
    result = reservation.release_hold(hold_token)
    promote_and_broadcast(result, meta['sig'])


@shared_task
def ping():
    """Trivial round-trip check for the Celery+Redis broker wiring (Phase 1)."""
    return 'pong'


@shared_task
def mark_completed_bookings_task():
    """Periodic (hourly, see CELERY_BEAT_SCHEDULE) — nothing else in this
    codebase ever transitions a Confirmed booking to Completed once its
    slot has passed, so this is the one place that happens. Fires the
    rewards completion hook (cashback/scratch-card/spin-wheel grants) for
    each booking it flips, exactly once."""
    from rewards.services import on_booking_completed
    from .models import Booking

    now = timezone.localtime()
    today = now.date()
    candidates = Booking.objects.filter(booking_status='Confirmed', date__lte=today)

    completed_ids = []
    for booking in candidates:
        try:
            end_h, end_m = map(int, booking.end_time.split(':'))
        except (ValueError, AttributeError):
            continue
        end_dt = timezone.make_aware(datetime.combine(booking.date, time(hour=end_h, minute=end_m)))
        if end_dt <= now:
            completed_ids.append(booking.id)

    if not completed_ids:
        return 0

    Booking.objects.filter(id__in=completed_ids).update(booking_status='Completed')
    for booking in Booking.objects.filter(id__in=completed_ids).select_related('user', 'box'):
        on_booking_completed(booking)
    return len(completed_ids)
