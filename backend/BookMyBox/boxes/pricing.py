# boxes/pricing.py
"""Peak/off-peak price resolution — the one place that decides what a box
actually costs for a given date/start_time, shared by
bookings/services.py's create_booking_row() and apply_coupon() so a
coupon's discount base and the actual charge can never disagree."""


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
