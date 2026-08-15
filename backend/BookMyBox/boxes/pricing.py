# boxes/pricing.py
"""Peak/off-peak price resolution — the one place that decides what a box
actually costs for a given date/start_time, shared by
bookings/services.py's create_booking_row() and apply_coupon() so a
coupon's discount base and the actual charge can never disagree."""
from decimal import Decimal


def resolve_box_price(box, date, start_time_str):
    """Returns the per-hour price for `box` at `date`/`start_time_str` — the
    matching PricingRule's price if one covers this exact start_time, else
    the box's flat `price`. Resolved by start_time only: a multi-hour
    booking that straddles a peak/off-peak boundary is billed at its
    start_time's rate for the whole duration (matches the existing
    duration-as-flat-multiplier simplicity elsewhere in this app)."""
    day_type = 'weekend' if date.weekday() >= 5 else 'weekday'
    rule = box.pricing_rules.filter(
        applies_to__in=[day_type, 'all'],
        start_time__lte=start_time_str,
        end_time__gt=start_time_str,
    ).first()
    return rule.price if rule else box.price


def resolve_commission_rate(owner, sport, on_date=None):
    """Returns the commission rate (as a 0-1 fraction, matching the old
    hardcoded `0.1` literal this replaces) the platform takes from `owner`'s
    bookings for `sport` on `on_date` — the latest CommissionRate row for
    that (owner, sport) pair whose effective_from has passed, or the
    admin-editable PlatformCommissionSetting (itself falling back to
    settings.DEFAULT_COMMISSION_RATE) if no override exists."""
    from django.utils import timezone
    from .models import CommissionRate, PlatformCommissionSetting

    if owner is None:
        return PlatformCommissionSetting.get_rate_fraction()

    on_date = on_date or timezone.now().date()
    rate = CommissionRate.objects.filter(
        owner=owner, sport=sport, effective_from__lte=on_date,
    ).order_by('-effective_from').values_list('rate', flat=True).first()
    if rate is not None:
        return rate / Decimal('100')
    return PlatformCommissionSetting.get_rate_fraction()
