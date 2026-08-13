# owner_dashboard/services.py
"""Owner earnings computation — shared by PayoutViewSet.balance() (the
on-demand "what do I currently owe/am I owed" view) and the scheduled-payout
task (owner_dashboard/tasks.py), so the per-booking commission math is
written once. Per-owner-per-sport CommissionRate overrides (see
boxes/pricing.py::resolve_commission_rate) mean commission can no longer be
a single flat-rate multiply against an aggregate Sum — it has to be resolved
per booking."""
from decimal import Decimal

from boxes.pricing import resolve_commission_rate
from bookings.models import Booking

ACTIVE_STATUSES = ["Confirmed", "Completed"]


def compute_owner_earnings(owner, since=None, until=None):
    """Returns {gross_revenue, commission, net_revenue, by_sport} for
    `owner`'s ACTIVE_STATUSES bookings, optionally windowed to
    created_at >= since / < until (both optional; a full-lifetime call
    passes neither). `by_sport` breaks the same totals down per sport, for
    the owner-facing "why was I charged this" display."""
    bookings = Booking.objects.filter(box__owner=owner, booking_status__in=ACTIVE_STATUSES).select_related('box')
    if since is not None:
        bookings = bookings.filter(created_at__gte=since)
    if until is not None:
        bookings = bookings.filter(created_at__lt=until)

    gross = Decimal('0')
    commission = Decimal('0')
    by_sport = {}
    for booking in bookings:
        sport = booking.box.sport if booking.box else ''
        amount = booking.total_amount or Decimal('0')
        rate = resolve_commission_rate(owner, sport, booking.date)
        booking_commission = amount * rate

        gross += amount
        commission += booking_commission

        row = by_sport.setdefault(sport, {'sport': sport, 'rate': rate, 'gross': Decimal('0'), 'commission': Decimal('0')})
        row['gross'] += amount
        row['commission'] += booking_commission
        row['rate'] = rate  # latest-resolved rate for display; rows are same-sport so this stays consistent enough for a UI label

    for row in by_sport.values():
        row['net'] = row['gross'] - row['commission']

    return {
        'gross_revenue': gross,
        'commission': commission,
        'net_revenue': gross - commission,
        'by_sport': list(by_sport.values()),
    }
