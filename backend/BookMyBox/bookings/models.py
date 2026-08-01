# bookings/models.py

from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings  # For AUTH_USER_MODEL


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