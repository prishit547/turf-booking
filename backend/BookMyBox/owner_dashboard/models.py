# owner_dashboard/models.py
from django.conf import settings
from django.db import models


class Payout(models.Model):
    """A manual record that the platform paid an owner some amount outside
    the app (bank transfer, cash, etc.) — not a real payment integration,
    consistent with the rest of this app's payment fields (Booking's
    payment_status/payment_id) being record-keeping only, never a live
    gateway. An owner's outstanding balance is computed on the fly as
    (commission-adjusted net revenue) minus the sum of their Payout rows —
    see PayoutViewSet.balance in owner_dashboard/views.py."""
    SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('scheduled', 'Scheduled'),
    ]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payouts')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True, default='')
    source = models.CharField(
        max_length=10, choices=SOURCE_CHOICES, default='manual',
        help_text="'scheduled' rows are auto-created by run_scheduled_payouts_task (owner_dashboard/tasks.py).",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payouts_recorded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Payout of {self.amount} to {self.owner.email}"


class PayoutSchedule(models.Model):
    """An owner's payout cadence — checked daily by run_scheduled_payouts_task
    (owner_dashboard/tasks.py). `last_run_at` is the cursor marking what's
    already been paid out via this schedule, so a re-run (or a second check
    the same day) never double-counts the same earnings window."""
    FREQUENCY_CHOICES = [
        ('weekly', 'Weekly'),
        ('biweekly', 'Biweekly'),
        ('monthly', 'Monthly'),
    ]
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payout_schedule')
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default='monthly')
    day_of_week = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="0=Monday..6=Sunday. Used when frequency is weekly/biweekly.",
    )
    day_of_month = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="1-28. Used when frequency is monthly.",
    )
    active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payout_schedules_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.owner.email}: {self.get_frequency_display()}"
