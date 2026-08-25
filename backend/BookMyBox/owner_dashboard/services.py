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

# Selectable reporting windows for the owner's earnings views. Every money
# figure shown to an owner is labelled with one of these, so an amount is
# never ambiguous about the period it covers.
EARNINGS_PERIODS = {
    'this_month': 'This month',
    'last_month': 'Last month',
    'last_3_months': 'Last 3 months',
    'last_6_months': 'Last 6 months',
    'last_12_months': 'Last 12 months',
    'all_time': 'All time',
}
DEFAULT_EARNINGS_PERIOD = 'this_month'


def _add_months(anchor, months):
    """First-of-month `anchor` shifted by `months` (may be negative)."""
    total = anchor.month - 1 + months
    year = anchor.year + total // 12
    month = total % 12 + 1
    return anchor.replace(year=year, month=month, day=1)


def resolve_period(period, today):
    """Map a period key to an inclusive (date_from, date_to, label) tuple.
    date_from is None for 'all_time'. Unknown keys fall back to the default
    rather than erroring, so a stale bookmark can't 500."""
    from datetime import timedelta

    key = period if period in EARNINGS_PERIODS else DEFAULT_EARNINGS_PERIOD
    label = EARNINGS_PERIODS[key]
    month_start = today.replace(day=1)

    if key == 'all_time':
        return None, None, label, key
    if key == 'this_month':
        return month_start, today, label, key
    if key == 'last_month':
        prev_start = _add_months(month_start, -1)
        return prev_start, month_start - timedelta(days=1), label, key
    months = {'last_3_months': 3, 'last_6_months': 6, 'last_12_months': 12}[key]
    # Inclusive of the current partial month, e.g. "last 3 months" in
    # mid-September spans 1 Jul -> today.
    return _add_months(month_start, -(months - 1)), today, label, key


def compute_owner_earnings(owner, since=None, until=None, date_from=None, date_to=None, box=None):
    """Returns {gross_revenue, commission, net_revenue, bookings_count,
    by_sport, by_box} for `owner`'s ACTIVE_STATUSES bookings.

    Two independent windows, because "when was this booked" and "when was
    the slot played" are different questions and each has its own correct
    use:
      * `since`/`until` filter on **created_at** (a datetime) — what the
        scheduled-payout task needs ("everything booked since I last ran"),
        so this semantic must not drift.
      * `date_from`/`date_to` filter on **Booking.date** (the slot's own
        date, inclusive) — what an owner means by "what did this box earn
        in September", and what the dashboard's revenue chart already uses.

    `by_sport` and `by_box` break the same totals down, for the owner-facing
    "which box actually earned this / why was I charged this" displays.
    """
    bookings = Booking.objects.filter(box__owner=owner, booking_status__in=ACTIVE_STATUSES).select_related('box')
    if since is not None:
        bookings = bookings.filter(created_at__gte=since)
    if until is not None:
        bookings = bookings.filter(created_at__lt=until)
    if date_from is not None:
        bookings = bookings.filter(date__gte=date_from)
    if date_to is not None:
        bookings = bookings.filter(date__lte=date_to)
    if box is not None:
        bookings = bookings.filter(box=box)

    gross = Decimal('0')
    commission = Decimal('0')
    count = 0
    by_sport = {}
    by_box = {}
    for booking in bookings:
        sport = booking.box.sport if booking.box else ''
        amount = booking.total_amount or Decimal('0')
        rate = resolve_commission_rate(owner, sport, booking.date)
        booking_commission = amount * rate

        gross += amount
        commission += booking_commission
        count += 1

        row = by_sport.setdefault(sport, {'sport': sport, 'rate': rate, 'gross': Decimal('0'), 'commission': Decimal('0'), 'bookings': 0})
        row['gross'] += amount
        row['commission'] += booking_commission
        row['bookings'] += 1
        row['rate'] = rate  # latest-resolved rate for display; rows are same-sport so this stays consistent enough for a UI label

        if booking.box:
            box_row = by_box.setdefault(booking.box_id, {
                'box_id': booking.box_id, 'box_name': booking.box.name, 'sport': sport,
                'rate': rate, 'gross': Decimal('0'), 'commission': Decimal('0'), 'bookings': 0,
            })
            box_row['gross'] += amount
            box_row['commission'] += booking_commission
            box_row['bookings'] += 1
            box_row['rate'] = rate

    for row in by_sport.values():
        row['net'] = row['gross'] - row['commission']
    for row in by_box.values():
        row['net'] = row['gross'] - row['commission']

    return {
        'gross_revenue': gross,
        'commission': commission,
        'net_revenue': gross - commission,
        'bookings_count': count,
        'by_sport': list(by_sport.values()),
        'by_box': sorted(by_box.values(), key=lambda r: r['gross'], reverse=True),
    }
