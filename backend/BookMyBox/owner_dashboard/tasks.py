# owner_dashboard/tasks.py
"""Scheduled payouts — a daily Celery Beat job (see CELERY_BEAT_SCHEDULE in
BookMyBox/settings.py) that checks every active PayoutSchedule and, if due
today, records a Payout row for whatever the owner has earned since their
last scheduled run. Stays in the same "record-keeping only, never a live
payment gateway" spirit as the existing manual Payout ledger — this task
never moves real money, it just automates the bookkeeping + notification."""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from user.notifications import notify
from .models import Payout, PayoutSchedule
from .services import compute_owner_earnings


def is_due_today(schedule, today):
    """Whether `schedule` should fire if the task runs on `today` — "due",
    not "due exactly today": once a schedule's target day for the current
    period has arrived, it stays due on every subsequent day until it
    actually runs, instead of only matching the exact target day. That's
    deliberate — Celery Beat downtime, a deploy, or any other reason the
    daily task doesn't execute right on the target day would otherwise
    silently skip that whole period's payout, with nothing waiting to catch
    it up (see run_scheduled_payouts_task's own docstring: the earnings
    window it computes already spans back to last_run_at regardless of how
    many days were missed, so firing once as soon as the task next runs is
    sufficient to catch up — no need to fire once per missed day)."""
    if not schedule.active:
        return False

    if schedule.frequency == 'monthly':
        target_day = min(schedule.day_of_month or 1, 28)
        if today.day < target_day:
            return False
        if schedule.last_run_at and schedule.last_run_at.date().year == today.year \
                and schedule.last_run_at.date().month == today.month:
            return False  # already ran for this month's cycle
        return True

    if schedule.frequency == 'weekly':
        target_weekday = schedule.day_of_week or 0
        if today.weekday() < target_weekday:
            return False
        period_start = today - timedelta(days=today.weekday() - target_weekday)
        if schedule.last_run_at and schedule.last_run_at.date() >= period_start:
            return False  # already ran for this week's cycle
        return True

    if schedule.frequency == 'biweekly':
        target_weekday = schedule.day_of_week or 0
        if today.weekday() < target_weekday:
            return False
        # Every other matching weekday, anchored to the schedule's creation
        # week — simple and deterministic without needing extra state.
        weeks_since_creation = (today - schedule.created_at.date()).days // 7
        if weeks_since_creation % 2 != 0:
            return False
        period_start = today - timedelta(days=today.weekday() - target_weekday)
        if schedule.last_run_at and schedule.last_run_at.date() >= period_start:
            return False  # already ran for this 2-week cycle
        return True

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
