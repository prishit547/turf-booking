# rewards/models.py
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


class Wallet(models.Model):
    """One balance per user, credited by cashback/scratch-cards/spin-wheel/
    redeem-codes and debited when spent at checkout — see services.py's
    credit_wallet()/debit_wallet() for the only code paths allowed to touch
    `balance` directly (always inside a select_for_update() transaction,
    since this is real money)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Wallet({self.user.email}) = {self.balance}"


class WalletTransaction(models.Model):
    """An immutable ledger row for every wallet credit/debit — amount is
    signed (positive credit, negative debit) and balance_after is snapshotted
    at write time so the full history is reconstructable without recomputing
    it from scratch. This is the single source of truth every "where did my
    cashback go" / admin liability question is answered from."""
    TYPE_CHOICES = [
        ('cashback', 'Cashback'),
        ('scratch_card', 'Scratch card win'),
        ('spin_wheel', 'Spin wheel win'),
        ('redeem_code', 'Redeemed code'),
        ('booking_payment', 'Applied to booking'),
        ('admin_adjustment', 'Admin adjustment'),
    ]
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    description = models.CharField(max_length=255, blank=True, default='')
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_transactions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type}: {self.amount} for {self.wallet.user.email}"


class CashbackRule(models.Model):
    """Platform-wide cashback config — only one row is expected to be
    active at a time (mirrors Coupon's single-active-thing simplicity, see
    bookings/models.py::Coupon); creating a new active rule deactivates any
    other one in the serializer. Applied automatically once a booking
    completes — see services.py::apply_cashback()."""
    percent = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percent of the booking total, 0-100.")
    max_cashback = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Cap per booking. Leave blank for uncapped.",
    )
    min_booking_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='cashback_rules_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.percent}% cashback" + (" (active)" if self.active else "")


class ScratchCardConfig(models.Model):
    """An admin-defined prize tier a newly-granted scratch card is randomly
    drawn from at *grant* time (see services.py::grant_scratch_card) —
    the outcome is decided server-side the moment the card is created, so
    "revealing" it is just reading back an already-committed row, never a
    client-trusted random roll."""
    label = models.CharField(max_length=100)
    prize_amount = models.DecimalField(max_digits=10, decimal_places=2)
    weight = models.PositiveIntegerField(default=1, help_text="Relative odds of this tier being picked.")
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.label} (₹{self.prize_amount})"


class ScratchCard(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='scratch_cards')
    config = models.ForeignKey(ScratchCardConfig, on_delete=models.SET_NULL, null=True, blank=True, related_name='cards')
    prize_amount = models.DecimalField(max_digits=10, decimal_places=2)
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='scratch_cards')
    is_scratched = models.BooleanField(default=False)
    scratched_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def is_claimable(self):
        return not self.is_scratched and timezone.now() < self.expires_at

    def __str__(self):
        return f"ScratchCard({self.user.email}, {'scratched' if self.is_scratched else 'unscratched'})"


class SpinWheelSegment(models.Model):
    label = models.CharField(max_length=100)
    prize_amount = models.DecimalField(max_digits=10, decimal_places=2)
    weight = models.PositiveIntegerField(default=1, help_text="Relative odds of this segment being picked.")
    color = models.CharField(max_length=7, default='#D1FB00', help_text="Hex color for the frontend wheel.")
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.label} (₹{self.prize_amount})"


class SpinEntitlement(models.Model):
    """One free spin, granted per completed booking (see
    services.py::grant_spin_entitlement) — the "do you have a spin
    available" queue. Consumed oldest-first by the spin endpoint."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='spin_entitlements')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='spin_entitlements')
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"SpinEntitlement({self.user.email}, {'used' if self.used else 'available'})"


class SpinAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='spin_attempts')
    segment = models.ForeignKey(SpinWheelSegment, on_delete=models.SET_NULL, null=True, related_name='attempts')
    entitlement = models.ForeignKey(SpinEntitlement, on_delete=models.SET_NULL, null=True, related_name='attempt')
    prize_amount = models.DecimalField(max_digits=10, decimal_places=2)
    spun_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-spun_at']

    def __str__(self):
        return f"SpinAttempt({self.user.email}, won {self.prize_amount})"


def _generate_redeem_code():
    # Uppercase, human-typeable, base32-ish alphabet without ambiguous chars.
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(10))


class RedeemCode(models.Model):
    """An admin-generated voucher code worth a fixed wallet credit,
    distributed offline (print, promo, etc.) and redeemed once by whoever
    types it in — see services.py::redeem_code(). Structurally mirrors
    bookings/models.py::Coupon's admin-config shape, but single-use and
    randomly generated rather than admin-typed."""
    code = models.CharField(max_length=20, unique=True, default=_generate_redeem_code)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    batch_label = models.CharField(max_length=100, blank=True, default='')
    is_used = models.BooleanField(default=False)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='redeemed_codes',
    )
    used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='redeem_codes_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def is_claimable(self):
        if self.is_used:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def __str__(self):
        return self.code
