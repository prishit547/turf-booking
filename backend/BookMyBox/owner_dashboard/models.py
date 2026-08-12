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
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payouts')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payouts_recorded',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Payout of {self.amount} to {self.owner.email}"
