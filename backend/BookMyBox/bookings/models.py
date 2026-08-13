# bookings/models.py
import secrets

from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings  # For AUTH_USER_MODEL
from django.utils import timezone


class Booking(models.Model):
    PAYMENT_STATUS_CHOICES = [
        ('Not Required', 'Not Required'),
        ('Pending', 'Pending'),
        ('Completed', 'Completed'),
        ('Failed', 'Failed'),
        ('Refunded', 'Refunded'),
    ]

    BOOKING_STATUS_CHOICES = [
        ('Confirmed', 'Confirmed'),
        ('Cancelled', 'Cancelled'),
        ('Completed', 'Completed'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bookings')
    box = models.ForeignKey('boxes.Box', on_delete=models.CASCADE, related_name='bookings')
    date = models.DateField()
    start_time = models.CharField(max_length=5)  # e.g., "09:00"
    end_time = models.CharField(max_length=5)  # e.g., "10:00"
    duration = models.IntegerField(help_text="Duration in hours")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(
        max_length=50,
        choices=PAYMENT_STATUS_CHOICES,
        default='Not Required'
    )
    payment_id = models.CharField(max_length=255, blank=True, null=True)  # Optional reference for a future "mark paid at venue" action
    booking_status = models.CharField(
        max_length=50,
        choices=BOOKING_STATUS_CHOICES,
        default='Confirmed'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cancelled_bookings',
        help_text="Who cancelled this booking (customer, owner, or admin) — null if never cancelled.",
    )
    cancellation_reason = models.TextField(blank=True, default='')
    cancelled_at = models.DateTimeField(null=True, blank=True)

    BOOKING_SOURCE_CHOICES = [
        ('online', 'Online'),
        ('owner_manual', 'Owner (walk-in/manual)'),
    ]
    booking_source = models.CharField(
        max_length=20,
        choices=BOOKING_SOURCE_CHOICES,
        default='online',
        help_text="Whether a customer booked this online, or the box owner created it directly (walk-in/manual).",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_bookings',
        help_text="Who actually created this row — the booking customer for an online booking, or the box owner for a manual/walk-in one.",
    )
    customer_name = models.CharField(max_length=150, blank=True, default='')
    customer_phone = models.CharField(max_length=20, blank=True, default='')

    recurring_group_id = models.UUIDField(
        null=True, blank=True, db_index=True,
        help_text="Links sibling occurrences of the same recurring-booking request — null for a one-off booking.",
    )

    coupon_code = models.CharField(max_length=30, blank=True, default='')
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    cashback_credited_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Set once rewards.services.apply_cashback() has credited this booking — guards against double-crediting.",
    )
    wallet_amount_used = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Portion of total_amount paid via wallet balance at checkout. Does not reduce total_amount — owner revenue/commission is still computed off the full price.",
    )

    class Meta:
        ordering = ['date', 'start_time']
        constraints = [
            # Defense-in-depth guard independent of the Redis reservation
            # layer (bookings/reservation.py) — Redis is a fast-path/UX
            # cache, never the sole source of truth, so the DB must still
            # be able to reject a double-booking on its own. Scoped to
            # Confirmed/Completed only (matching migration 0002's original
            # reasoning) so a cancelled booking never permanently blocks a
            # slot. Note this only catches an *exact* start_time collision,
            # not the general overlapping-interval case (e.g. a 1hr booking
            # at 09:00 vs. a 2hr booking at 08:30) — that case remains
            # guarded by the overlaps() check in bookings/views.py, same as
            # before this constraint existed.
            models.UniqueConstraint(
                fields=['box', 'date', 'start_time'],
                condition=models.Q(booking_status__in=['Confirmed', 'Completed']),
                name='unique_active_booking_per_box_date_start',
            ),
        ]

    def clean(self):
        super().clean()
        self._validate_times()

    def _validate_times(self):
        """Validate that start_time and end_time are valid HH:MM strings."""
        try:
            start_h, start_m = map(int, self.start_time.split(':'))
            end_h, end_m = map(int, self.end_time.split(':'))
        except (ValueError, AttributeError):
            raise ValidationError("start_time and end_time must be in HH:MM format.")

        if not (0 <= start_h <= 23 and 0 <= start_m <= 59 and 0 <= end_h <= 23 and 0 <= end_m <= 59):
            raise ValidationError("start_time and end_time must be valid times.")

        if (end_h, end_m) <= (start_h, start_m):
            raise ValidationError("end_time must be after start_time.")

    def overlaps(self, other_date, other_start, other_end):
        """Return True if this booking overlaps with another time range."""
        if self.date != other_date:
            return False
        if self.booking_status == 'Cancelled':
            return False
        try:
            self_start = tuple(map(int, self.start_time.split(':')))
            self_end = tuple(map(int, self.end_time.split(':')))
            other_start = tuple(map(int, other_start.split(':')))
            other_end = tuple(map(int, other_end.split(':')))
        except (ValueError, AttributeError):
            return False
        # Two intervals overlap if self_start < other_end and other_start < self_end
        return self_start < other_end and other_start < self_end

    def __str__(self):
        return f"Booking by {self.user.email} for {self.box.name} on {self.date} at {self.start_time}"


class Coupon(models.Model):
    """A platform-wide discount code — deliberately simple (not per-user,
    no stacking): a code, a percent-or-flat discount, an optional validity
    window, an optional total-use cap. See bookings/services.py's
    apply_coupon() for validation + bookings/services.py's
    create_booking_row() for how the discount is applied."""
    DISCOUNT_TYPE_CHOICES = [
        ('percent', 'Percent off'),
        ('flat', 'Flat amount off'),
    ]

    code = models.CharField(max_length=30, unique=True)
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE_CHOICES)
    value = models.DecimalField(max_digits=10, decimal_places=2, help_text="Percent (0-100) or flat ₹ amount, depending on discount_type.")
    active = models.BooleanField(default=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text="Leave blank for unlimited uses.")
    used_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='coupons_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        self.code = (self.code or '').strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class WaitlistEntry(models.Model):
    """A user's request to be notified if a specific, currently-booked slot
    (exact box/date/start_time/duration) frees up. Distinct from the
    short-lived Redis hold/queue in reservation.py, which only matters
    during an active checkout hold — this is a persistent, one-shot signup
    that survives until either the slot opens up (see
    bookings/services.py's cancel_booking(), which notifies + deletes
    matching entries) or the user leaves the waitlist themselves."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='waitlist_entries')
    box = models.ForeignKey('boxes.Box', on_delete=models.CASCADE, related_name='waitlist_entries')
    date = models.DateField()
    start_time = models.CharField(max_length=5)
    duration = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('user', 'box', 'date', 'start_time', 'duration')

    def __str__(self):
        return f"{self.user.email} waiting for {self.box.name} on {self.date} at {self.start_time}"


def _generate_invite_token():
    return secrets.token_urlsafe(32)


class BookingInvite(models.Model):
    """A booker's invite for someone else to join their booking (group/
    split bookings) — either an existing account (invited_user set
    directly) or a raw email address that may not have an account yet
    (invited_user filled in once they claim the invite). Deliberately a
    separate model rather than a Booking.participants M2M: `Booking.user`
    (the sole booker) is relied on throughout this codebase for ownership
    checks, admin/owner aggregations, and cancellation — participants are
    additive, read-only viewers of the same row, not co-owners.

    Acceptance is token-authorized, not email-matched: whoever is
    authenticated when they open the invite link and accept it claims it,
    same as most real invite-link products (Google Docs, etc.) — no hard
    requirement that the accepting account's email equals invited_email."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
    ]
    booking = models.ForeignKey(Booking, related_name='invites', on_delete=models.CASCADE)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_booking_invites')
    invited_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        related_name='booking_invites', help_text="Set once an existing account is invited, or once a raw-email invite is claimed.",
    )
    invited_email = models.EmailField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    token = models.CharField(max_length=64, unique=True, default=_generate_invite_token)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def is_claimable(self):
        return self.status == 'pending' and timezone.now() < self.expires_at

    def __str__(self):
        return f"Invite to {self.invited_email} for booking #{self.booking_id} ({self.status})"