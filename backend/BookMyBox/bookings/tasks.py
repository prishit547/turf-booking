from celery import shared_task

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
