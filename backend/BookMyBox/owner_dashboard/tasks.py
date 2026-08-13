# owner_dashboard/tasks.py
"""Scheduled payouts — a daily Celery Beat job (see CELERY_BEAT_SCHEDULE in
BookMyBox/settings.py) that checks every active PayoutSchedule and, if due
today, records a Payout row for whatever the owner has earned since their
last scheduled run. Stays in the same "record-keeping only, never a live
payment gateway" spirit as the existing manual Payout ledger — this task
never moves real money, it just automates the bookkeeping + notification."""
from celery import shared_task
from django.utils import timezone

from user.notifications import notify
from .models import Payout, PayoutSchedule
from .services import compute_owner_earnings


def is_due_today(schedule, today):
    if not schedule.active:
        return False
    if schedule.frequency == 'monthly':
        day = schedule.day_of_month or 1
        return today.day == min(day, 28)
    if schedule.frequency == 'weekly':
        return today.weekday() == (schedule.day_of_week or 0)
    if schedule.frequency == 'biweekly':
        if today.weekday() != (schedule.day_of_week or 0):
            return False
        # Every other matching weekday, anchored to the schedule's creation
        # week — simple and deterministic without needing extra state.
        weeks_since_creation = (today - schedule.created_at.date()).days // 7
        return weeks_since_creation % 2 == 0
    return False


@shared_task
def run_scheduled_payouts_task():
    now = timezone.now()
    today = timezone.localdate()
    processed = 0

    for schedule in PayoutSchedule.objects.filter(active=True).select_related('owner'):
        if schedule.last_run_at and schedule.last_run_at.date() == today:
            continue  # already ran today — never double-process the same day
        if not is_due_today(schedule, today):
            continue

        earnings = compute_owner_earnings(schedule.owner, since=schedule.last_run_at, until=now)
        net = earnings['net_revenue']
        if net > 0:
            Payout.objects.create(
                owner=schedule.owner, amount=net, source='scheduled',
                note='Automatic scheduled payout', created_by=None,
            )
            notify(
                schedule.owner, 'Payout processed',
                f"Your scheduled payout of ₹{net} has been recorded.",
            )
        schedule.last_run_at = now
        schedule.save(update_fields=['last_run_at'])
        processed += 1

    return processed
