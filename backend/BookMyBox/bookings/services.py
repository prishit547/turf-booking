# bookings/services.py
"""Shared booking-mutation logic used by more than one call site — the
customer/admin cancel action on BookingViewSet and the owner-cancel action
on OwnerBookingViewSet share cancel_booking(); the direct create(), the
two-phase confirm(), and the owner-manual booking action all share
validate_booking_request()/create_booking_row() — so these rules live in
exactly one place instead of being reimplemented per call site.
"""

import logging
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError

from boxes.models import Box
from boxes.pricing import resolve_box_price
from user.notifications import notify

logger = logging.getLogger(__name__)


class CancellationError(Exception):
    """Raised for any expected cancellation failure (already cancelled, too
    close to start time) so callers can turn it into an HTTP response
    without each re-implementing the same checks."""

    def __init__(self, detail, status_code=400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class RescheduleError(Exception):
    """Raised for any expected reschedule failure (not Confirmed, already
    rescheduled once, too close to start time, new slot unavailable) so the
    view can turn it into an HTTP response without reimplementing these
    checks — mirrors CancellationError's shape exactly."""

    def __init__(self, detail, status_code=400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class BookingWriteError(Exception):
    """Raised by create_booking_row for any expected failure (box missing,
    not approved, overlap conflict) so every write path (create, confirm,
    owner-manual booking) can share one code path for turning it into an
    HTTP response, instead of each reimplementing the same box-lock-and-
    check logic."""

    def __init__(self, detail, status_code):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def cancel_booking(booking, *, cancelled_by, reason=None):
    """Cancel `booking` on behalf of `cancelled_by`, enforcing the standard
    2-hour-notice guard. Raises CancellationError if the booking is already
    cancelled or too close to its start time. Does not check permissions —
    callers decide who is allowed to invoke this for a given booking."""
    if booking.booking_status == 'Cancelled':
        raise CancellationError('Booking already cancelled.')

    booking_dt = datetime.combine(booking.date, time.fromisoformat(booking.start_time))
    if settings.USE_TZ:
        booking_dt = timezone.make_aware(booking_dt)

    if timezone.now() > booking_dt - timedelta(hours=2):
        raise CancellationError('Cancellation not allowed within 2 hours of booking time.')

    booking.booking_status = 'Cancelled'
    booking.cancelled_by = cancelled_by
    booking.cancellation_reason = (reason or '').strip()
    booking.cancelled_at = timezone.now()
    booking.save()

    _refund_booking(booking)

    # Notify whichever party didn't do the cancelling — the customer if the
    # owner/admin cancelled on them, or the box owner if the customer cancelled.
    customer_cancelled_own_booking = cancelled_by is not None and cancelled_by.id == booking.user_id
    if customer_cancelled_own_booking:
        notify(
            booking.box.owner,
            'Booking cancelled by customer',
            f"{booking.user.full_name or booking.user.email} cancelled their booking for "
            f"{booking.box.name} on {booking.date} at {booking.start_time}.",
        )
    else:
        notify(
            booking.user,
            'Your booking was cancelled',
            f"Your booking for {booking.box.name} on {booking.date} at {booking.start_time} was cancelled"
            + (f": {booking.cancellation_reason}" if booking.cancellation_reason else '.'),
        )

    _notify_and_clear_waitlist(booking)
    logger.info(
        "Booking #%s cancelled by user #%s (box=%s date=%s start_time=%s)",
        booking.id, cancelled_by.id if cancelled_by else None, booking.box_id, booking.date, booking.start_time,
    )
    return booking


def _refund_booking(booking):
    """Reverses whatever the platform can actually reverse for a
    just-cancelled booking. There's no real payment gateway anywhere in this
    app (see rewards/services.py credit_wallet callers) — the wallet is the
    only real money the platform ever collected, so any amount paid from it
    (Booking.wallet_amount_used) is credited straight back. payment_status
    moves to 'Refunded' whenever the booking had actually been marked paid,
    so the booking's own record reflects that nothing is owed either way."""
    if booking.wallet_amount_used and booking.wallet_amount_used > 0:
        from rewards.services import credit_wallet
        credit_wallet(
            booking.user, booking.wallet_amount_used, 'refund',
            f"Refund for cancelled booking #{booking.id}", booking=booking,
        )
    if booking.payment_status in ('Completed', 'Pending'):
        booking.payment_status = 'Refunded'
        booking.save(update_fields=['payment_status'])


def _notify_and_clear_waitlist(booking):
    """Cancelling a Confirmed booking frees up its exact slot signature —
    notify everyone waitlisted for it (one-shot, per WaitlistEntry's
    docstring) and clear their entries, since the notification already
    happened; if they don't grab it in time, they'd need to rejoin the
    waitlist for whoever books it next."""
    from .models import WaitlistEntry

    entries = WaitlistEntry.objects.filter(
        box=booking.box, date=booking.date, start_time=booking.start_time, duration=booking.duration,
    ).select_related('user')
    for entry in entries:
        notify(
            entry.user,
            'A slot you wanted is now available',
            f"The slot you were waiting for at {booking.box.name} on {booking.date} at {booking.start_time} "
            "just opened up — book it before someone else does.",
            link=f'/boxes/{booking.box_id}',
        )
    entries.delete()


def reschedule_booking(booking, *, rescheduled_by, new_date, new_start_time_str):
    """Reschedule `booking` to a new date/start_time, on behalf of
    `rescheduled_by` — either the customer or the box owner (see
    BookingViewSet.get_queryset()'s widened retrieve/cancel/reschedule
    grant). Duration and box stay fixed (so total_amount never needs to
    change) — only date/start_time (and the correspondingly-shifted
    end_time) move. Enforces: only a Confirmed booking can be rescheduled;
    the same 2-hour notice cutoff cancel_booking() enforces, checked
    against the booking's *current* start time; only one reschedule ever,
    to keep abuse/complexity bounded; and the new slot must pass the same
    box-hours/blocked-date/overlap checks a fresh booking would, under a
    box row lock (mirroring create_booking_row's own locking) so a
    concurrent booking on the new slot can't race this. Does not check
    permissions — callers decide who is allowed to invoke this for a given
    booking."""
    from .models import Booking

    if booking.booking_status != 'Confirmed':
        raise RescheduleError('Only confirmed bookings can be rescheduled.')

    if booking.rescheduled_at is not None:
        raise RescheduleError(
            'This booking has already been rescheduled once. Please contact the venue, or cancel and create a new booking.'
        )

    booking_dt = datetime.combine(booking.date, time.fromisoformat(booking.start_time))
    if settings.USE_TZ:
        booking_dt = timezone.make_aware(booking_dt)
    if timezone.now() > booking_dt - timedelta(hours=2):
        raise RescheduleError('Rescheduling is not allowed within 2 hours of the booking time.')

    now = timezone.localtime()
    if new_date < now.date():
        raise RescheduleError('Cannot reschedule to a slot in the past.')
    if new_date == now.date():
        try:
            new_start_dt = timezone.make_aware(datetime.combine(new_date, parse_time(new_start_time_str)))
        except ValidationError as e:
            reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
            raise RescheduleError(str(reason))
        if new_start_dt <= now:
            raise RescheduleError('Cannot reschedule to a time slot that has already passed.')

    try:
        end_time_str = compute_end_time_str(new_date, new_start_time_str, booking.duration)
    except ValidationError as e:
        reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
        raise RescheduleError(str(reason))

    with transaction.atomic():
        # Lock the box row, same as create_booking_row — a fresh booking
        # landing on the new slot at the same moment must not be able to
        # slip past this check.
        box = Box.objects.select_for_update().get(pk=booking.box_id)

        if box.blocked_dates.filter(date=new_date).exists():
            raise RescheduleError(f"This facility is closed on {new_date}.")

        if new_start_time_str < box.opening_time or end_time_str > box.closing_time:
            raise RescheduleError(
                f"This facility is only bookable between {box.opening_time} and {box.closing_time}."
            )

        conflicting = Booking.objects.filter(
            box=box, date=new_date, booking_status__in=['Confirmed', 'Completed'],
        ).exclude(pk=booking.pk)
        if any(existing.overlaps(new_date, new_start_time_str, end_time_str) for existing in conflicting):
            raise RescheduleError('This time slot overlaps with an existing booking.', status.HTTP_409_CONFLICT)

        old_date, old_start_time = booking.date, booking.start_time

        # Only ever set on the FIRST reschedule (guarded by the
        # rescheduled_at is not None check above, this branch always fires
        # here since reschedule is one-shot) — kept as an explicit guard
        # anyway so the true original slot is never overwritten if this
        # function's one-reschedule invariant is ever relaxed later.
        if booking.original_date is None:
            booking.original_date = booking.date
            booking.original_start_time = booking.start_time

        booking.date = new_date
        booking.start_time = new_start_time_str
        booking.end_time = end_time_str
        booking.rescheduled_at = timezone.now()
        booking.save()

    # Notify whichever party didn't do the rescheduling — mirrors
    # cancel_booking's own notify-the-other-party logic exactly.
    customer_rescheduled_own_booking = rescheduled_by is not None and rescheduled_by.id == booking.user_id
    if customer_rescheduled_own_booking:
        notify(
            booking.box.owner,
            'Booking rescheduled by customer',
            f"{booking.user.full_name or booking.user.email} moved their booking for {booking.box.name} "
            f"from {old_date} at {old_start_time} to {booking.date} at {booking.start_time}.",
        )
    else:
        notify(
            booking.user,
            'Your booking was rescheduled',
            f"Your booking for {booking.box.name} was moved from {old_date} at {old_start_time} "
            f"to {booking.date} at {booking.start_time}.",
        )

    logger.info(
        "Booking #%s rescheduled by user #%s (box=%s %s %s -> %s %s)",
        booking.id, rescheduled_by.id if rescheduled_by else None, booking.box_id,
        old_date, old_start_time, booking.date, booking.start_time,
    )
    return booking


def parse_time(time_str):
    try:
        hour, minute = map(int, time_str.split(':'))
        return time(hour, minute)
    except (ValueError, IndexError, AttributeError):
        raise ValidationError("Invalid time format. Use HH:MM.")


def compute_end_time_str(booking_date, start_time_str, duration_hours):
    start_time_obj = parse_time(start_time_str)
    start_datetime = datetime.combine(booking_date, start_time_obj)
    end_datetime = start_datetime + timedelta(hours=duration_hours)
    # A booking can never cross midnight into the next calendar day. Python's
    # datetime arithmetic normalizes the hour back into 0-23 and rolls the
    # date forward instead of ever producing an out-of-range hour, so
    # checking end_datetime.hour alone (as the check below does) can never
    # actually detect this case — a 22:00 start with a 4-hour duration ends
    # up looking like a perfectly ordinary "hour 2" same-day time. Comparing
    # the date is the only reliable way to catch the wraparound.
    if end_datetime.date() != start_datetime.date():
        raise ValidationError("Booking cannot extend past midnight.")
    # Bookings must end by 23:00 at the latest
    if end_datetime.hour > 23 or (end_datetime.hour == 23 and end_datetime.minute > 0):
        raise ValidationError("Booking cannot extend past 23:00.")
    return end_datetime.time().strftime("%H:%M")


def validate_booking_request(data):
    """Shared by create()/reserve() (BookingViewSet) and the owner
    manual-booking action (OwnerBookingViewSet) — all accept the same
    {boxId, date, startTime, duration} shape and need identical validation."""
    box_id = data.get('boxId')
    date_str = data.get('date')
    start_time_str = data.get('startTime')
    duration_hours = data.get('duration')

    if not all([box_id, date_str, start_time_str, duration_hours]):
        raise ValidationError("Missing required booking details (boxId, date, startTime, duration).")

    try:
        duration_hours = int(duration_hours)
        if not (1 <= duration_hours <= 6):
            raise ValidationError("Duration must be between 1 and 6 hours.")
    except (ValueError, TypeError):
        raise ValidationError("Invalid duration format.")

    try:
        booking_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError("Invalid date format. Use YYYY-MM-DD.")

    now = timezone.localtime()
    if booking_date < now.date():
        raise ValidationError("Cannot book a slot in the past.")
    if booking_date == now.date():
        # Same convention as mark_completed_bookings_task: booking date/time
        # strings are wall-clock in the server's configured timezone, so
        # "now" for this comparison is localtime(), not a bare date. Without
        # this, a same-day slot whose start time has already gone by is
        # still bookable and payable — the date check above alone only
        # catches yesterday and earlier.
        start_dt = timezone.make_aware(datetime.combine(booking_date, parse_time(start_time_str)))
        if start_dt <= now:
            raise ValidationError("This time slot has already passed.")

    end_time_str = compute_end_time_str(booking_date, start_time_str, duration_hours)

    try:
        box = Box.objects.get(pk=box_id)
    except Box.DoesNotExist:
        raise ValidationError("Box not found.")

    if box.blocked_dates.filter(date=booking_date).exists():
        raise ValidationError(f"This facility is closed on {booking_date}.")

    if start_time_str < box.opening_time or end_time_str > box.closing_time:
        raise ValidationError(
            f"This facility is only bookable between {box.opening_time} and {box.closing_time}."
        )

    return {
        'box_id': box_id,
        'booking_date': booking_date,
        'start_time_str': start_time_str,
        'duration_hours': duration_hours,
        'end_time_str': end_time_str,
    }


def apply_coupon(box, duration_hours, code, booking_date, start_time_str, *, lock=False):
    """Validates a coupon code against `box`/`duration_hours` and returns
    `(coupon, discount_amount)`, or raises ValidationError with a specific
    reason. Deliberately does NOT increment `used_count` — that's left to
    the caller, since a dry-run preview (the /coupons/validate/ endpoint)
    must not consume a use, while create_booking_row() does consume one,
    atomically, under its own row lock (pass lock=True there).
    `booking_date`/`start_time_str` resolve the actual (possibly peak-priced)
    gross amount the discount applies to — must match create_booking_row()'s
    own resolution exactly, or the discount and the charge disagree."""
    from .models import Coupon

    queryset = Coupon.objects.select_for_update() if lock else Coupon.objects
    try:
        coupon = queryset.get(code=(code or '').strip().upper())
    except Coupon.DoesNotExist:
        raise ValidationError("Coupon not found.")

    if not coupon.active:
        raise ValidationError("This coupon is no longer active.")

    today = timezone.now().date()
    if coupon.valid_from and today < coupon.valid_from:
        raise ValidationError("This coupon isn't active yet.")
    if coupon.valid_until and today > coupon.valid_until:
        raise ValidationError("This coupon has expired.")
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise ValidationError("This coupon has reached its usage limit.")

    gross = resolve_box_price(box, booking_date, start_time_str) * duration_hours
    if coupon.discount_type == 'percent':
        discount_amount = gross * (coupon.value / 100)
    else:
        discount_amount = coupon.value
    discount_amount = min(discount_amount, gross)  # never discount below zero
    return coupon, discount_amount


def apply_redeem_code(box, duration_hours, code, booking_date, start_time_str, *, lock=False):
    """Box-scoped counterpart to apply_coupon() — validates an owner-issued
    RedeemCode (rewards.models.RedeemCode with box set) against `box`, same
    signature/return shape as apply_coupon so create_booking_row can treat
    them identically. Admin-issued (box=None) RedeemCodes are NOT valid
    here — those are wallet-only, see rewards/services.py::redeem_code()."""
    from rewards.models import RedeemCode

    queryset = RedeemCode.objects.select_for_update() if lock else RedeemCode.objects
    try:
        redeem = queryset.get(code=(code or '').strip().upper(), box=box)
    except RedeemCode.DoesNotExist:
        raise ValidationError("Redeem code not found for this facility.")

    if not redeem.is_claimable():
        raise ValidationError("This code has already been used or has expired.")

    gross = resolve_box_price(box, booking_date, start_time_str) * duration_hours
    discount_amount = min(redeem.value, gross)
    return redeem, discount_amount


def create_booking_row(user, box_id, booking_date, start_time_str, duration_hours, end_time_str,
                        *, booking_source='online', created_by=None, customer_name='',
                        customer_phone='', payment_status='Not Required', recurring_group_id=None,
                        coupon_code=None, redeem_code=None, use_wallet=False):
    """The transaction.atomic() + select_for_update() + overlaps() DB write —
    the authoritative safety net, reused as-is by create() (direct booking),
    confirm() (two-phase hold/queue booking), and the owner-manual booking
    action. Redis (reservation.py) is a fast-path/UX layer on top of this,
    never a replacement for it."""
    from .models import Booking

    with transaction.atomic():
        # Lock the box row to prevent race conditions while checking availability.
        try:
            box = Box.objects.select_for_update().get(pk=box_id)
        except Box.DoesNotExist:
            raise BookingWriteError("Box not found.", status.HTTP_400_BAD_REQUEST)

        if box.status != 'approved':
            raise BookingWriteError("This facility is not available for booking yet.", status.HTTP_400_BAD_REQUEST)

        # Defense-in-depth against a suspended owner: the public box listing
        # already excludes boxes owned by an inactive owner (see
        # PublicBoxViewSet), but this re-checks it here too in case a stale
        # cached listing slips through or a client calls the booking API
        # directly. An owner with no active account (including a box left
        # ownerless by a hard-deleted owner, see AdminUserDeleteView) can't
        # be a live venue to book.
        if not box.owner_id or not box.owner.is_active:
            raise BookingWriteError("This venue is temporarily unavailable for booking.", status.HTTP_400_BAD_REQUEST)

        if box.blocked_dates.filter(date=booking_date).exists():
            raise BookingWriteError(f"This facility is closed on {booking_date}.", status.HTTP_400_BAD_REQUEST)

        if coupon_code and redeem_code:
            raise BookingWriteError("Only one code can be applied per booking.", status.HTTP_400_BAD_REQUEST)

        expected_total_amount = resolve_box_price(box, booking_date, start_time_str) * duration_hours

        # Coupon/redeem-code is re-validated here (not trusted from an
        # earlier preview call) and locked for the duration of this
        # transaction, same reasoning as re-checking box.status above — the
        # row lock makes the used_count/is_used update below race-safe
        # against a concurrent booking applying the same code at the same
        # moment. Coupon and RedeemCode are deliberately separate branches
        # (not merged) since they're different models with different
        # consumption side-effects.
        applied_coupon = None
        applied_redeem = None
        discount_amount = 0
        if coupon_code:
            try:
                applied_coupon, discount_amount = apply_coupon(
                    box, duration_hours, coupon_code, booking_date, start_time_str, lock=True,
                )
            except ValidationError as e:
                reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
                raise BookingWriteError(str(reason), status.HTTP_400_BAD_REQUEST)
            expected_total_amount = expected_total_amount - discount_amount
        elif redeem_code:
            try:
                applied_redeem, discount_amount = apply_redeem_code(
                    box, duration_hours, redeem_code, booking_date, start_time_str, lock=True,
                )
            except ValidationError as e:
                reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
                raise BookingWriteError(str(reason), status.HTTP_400_BAD_REQUEST)
            expected_total_amount = expected_total_amount - discount_amount

        # Check overlap against all non-cancelled bookings for this box/date.
        existing_bookings = Booking.objects.filter(
            box=box,
            date=booking_date,
            booking_status__in=['Confirmed', 'Completed']
        )

        if any(existing.overlaps(booking_date, start_time_str, end_time_str) for existing in existing_bookings):
            raise BookingWriteError("This time slot overlaps with an existing booking.", status.HTTP_409_CONFLICT)

        try:
            # The Python-level overlaps() check above is the primary guard,
            # but it runs against a SELECT that isn't itself locked against
            # a concurrent transaction also mid-flight on this exact slot
            # (select_for_update() on the box row doesn't block a plain read
            # of Booking rows from another transaction on every backend this
            # app runs against — notably SQLite in local dev). The DB's own
            # conditional UniqueConstraint (see Booking.Meta) is the real
            # backstop for that race; catching it here turns a genuine but
            # rare double-submit into a clean conflict response instead of
            # an unhandled 500 that leaks a raw traceback to the client.
            booking = Booking.objects.create(
                user=user,
                box=box,
                date=booking_date,
                start_time=start_time_str,
                end_time=end_time_str,
                duration=duration_hours,
                total_amount=expected_total_amount,
                payment_status=payment_status,
                payment_id=None,
                booking_status='Confirmed',
                booking_source=booking_source,
                created_by=created_by,
                customer_name=customer_name,
                customer_phone=customer_phone,
                recurring_group_id=recurring_group_id,
                coupon_code=(applied_coupon.code if applied_coupon else (applied_redeem.code if applied_redeem else '')),
                discount_amount=discount_amount,
            )
        except IntegrityError:
            raise BookingWriteError(
                "This time slot was just booked by someone else. Please pick another slot.",
                status.HTTP_409_CONFLICT,
            )

        if applied_redeem:
            applied_redeem.is_used = True
            applied_redeem.used_by = user
            applied_redeem.used_at = timezone.now()
            applied_redeem.save(update_fields=['is_used', 'used_by', 'used_at'])

        if applied_coupon:
            applied_coupon.used_count = F('used_count') + 1
            applied_coupon.save(update_fields=['used_count'])

        # Wallet spend — applied after the coupon discount, against
        # whatever's left of expected_total_amount. Deliberately does NOT
        # change total_amount: the owner's revenue/commission are computed
        # off the full price regardless of how the platform's own
        # previously-issued wallet credit covered part of it (same
        # reasoning as cashback being a platform cost, never passed on to
        # the owner). If the wallet fully covers what's left, the booking
        # is marked paid outright — no separate "mark paid at venue" step.
        if use_wallet and expected_total_amount > 0:
            from rewards.services import debit_wallet, get_or_create_wallet
            wallet = get_or_create_wallet(user)
            wallet_deduction = min(wallet.balance, expected_total_amount)
            if wallet_deduction > 0:
                debit_wallet(user, wallet_deduction, 'booking_payment', f"Booking #{booking.id}", booking=booking)
                booking.wallet_amount_used = wallet_deduction
                if wallet_deduction >= expected_total_amount:
                    booking.payment_status = 'Completed'
                booking.save(update_fields=['wallet_amount_used', 'payment_status'])

        logger.info(
            "Booking #%s created for user #%s (box=%s date=%s start_time=%s amount=%s)",
            booking.id, user.id, box_id, booking_date, start_time_str, expected_total_amount,
        )
        return booking
