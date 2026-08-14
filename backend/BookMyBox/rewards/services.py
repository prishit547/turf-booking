# rewards/services.py
"""Core wallet operations plus the reward-granting hooks fired when a
booking completes. Every credit/debit goes through credit_wallet()/
debit_wallet() so the WalletTransaction ledger can never drift from
Wallet.balance — this is real money, so both are select_for_update()-guarded
the same way bookings/services.py guards Coupon/Box writes."""
import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from user.notifications import notify
from .models import (
    CashbackRule, OwnerScratchCardSetting, RedeemCode, ScratchCard, ScratchCardAutoGrantSetting,
    ScratchCardConfig, SpinAttempt, SpinEntitlement, SpinWheelSegment, Wallet, WalletTransaction,
)


def get_or_create_wallet(user):
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


def credit_wallet(user, amount, type, description='', booking=None):
    amount = Decimal(amount)
    if amount <= 0:
        raise ValidationError("Credit amount must be positive.")
    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get_or_create(user=user)[0]
        wallet.balance = wallet.balance + amount
        wallet.save(update_fields=['balance', 'updated_at'])
        txn = WalletTransaction.objects.create(
            wallet=wallet, amount=amount, balance_after=wallet.balance,
            type=type, description=description, booking=booking,
        )
    notify(user, 'Wallet credited', f"₹{amount} was added to your wallet. {description}".strip())
    return txn


def debit_wallet(user, amount, type, description='', booking=None):
    amount = Decimal(amount)
    if amount <= 0:
        raise ValidationError("Debit amount must be positive.")
    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get_or_create(user=user)[0]
        if wallet.balance < amount:
            raise ValidationError("Insufficient wallet balance.")
        wallet.balance = wallet.balance - amount
        wallet.save(update_fields=['balance', 'updated_at'])
        txn = WalletTransaction.objects.create(
            wallet=wallet, amount=-amount, balance_after=wallet.balance,
            type=type, description=description, booking=booking,
        )
    return txn


def apply_cashback(booking):
    """Credits cashback for a just-Completed booking, if an active
    CashbackRule applies. Idempotent via Booking.cashback_credited_at —
    safe to call more than once for the same booking."""
    if booking.cashback_credited_at is not None:
        return None
    rule = CashbackRule.objects.filter(active=True).order_by('-created_at').first()
    if rule is None or booking.total_amount < rule.min_booking_amount:
        return None
    amount = (rule.percent / Decimal('100')) * booking.total_amount
    if rule.max_cashback is not None:
        amount = min(amount, rule.max_cashback)
    amount = amount.quantize(Decimal('0.01'))
    if amount <= 0:
        return None
    credit_wallet(booking.user, amount, 'cashback', f"Cashback for booking #{booking.id}", booking=booking)
    booking.cashback_credited_at = timezone.now()
    booking.save(update_fields=['cashback_credited_at'])


def grant_scratch_card(user, booking=None):
    configs = list(ScratchCardConfig.objects.filter(active=True))
    if not configs:
        return None
    weights = [c.weight for c in configs]
    config = random.choices(configs, weights=weights, k=1)[0]
    return ScratchCard.objects.create(
        user=user, config=config, prize_amount=config.prize_amount, booking=booking,
        expires_at=timezone.now() + timedelta(days=30),
    )


def grant_spin_entitlement(user, booking=None):
    return SpinEntitlement.objects.create(user=user, booking=booking)


def scratch_card(user, card):
    """Reveals a scratch card: the prize was already decided at grant time
    (see grant_scratch_card) — this just checks eligibility, marks it
    scratched, and credits the wallet. Never trust a client-supplied prize
    value; the amount always comes from the row created server-side."""
    if card.user_id != user.id:
        raise ValidationError("This scratch card doesn't belong to you.")
    if not card.is_claimable():
        raise ValidationError("This scratch card has already been scratched or has expired.")
    card.is_scratched = True
    card.scratched_at = timezone.now()
    card.save(update_fields=['is_scratched', 'scratched_at'])
    credit_wallet(user, card.prize_amount, 'scratch_card', "Scratch card prize", booking=card.booking)
    return card


def spin_wheel(user):
    """Consumes the user's oldest unused SpinEntitlement (granted one per
    completed booking) and picks a weighted-random SpinWheelSegment
    server-side, so the frontend wheel is told exactly where to land rather
    than deciding the outcome itself."""
    entitlement = SpinEntitlement.objects.filter(user=user, used=False).order_by('created_at').first()
    if entitlement is None:
        raise ValidationError("You don't have a spin available.")
    segments = list(SpinWheelSegment.objects.filter(active=True))
    if not segments:
        raise ValidationError("The spin wheel isn't configured yet.")
    weights = [s.weight for s in segments]
    segment = random.choices(segments, weights=weights, k=1)[0]

    with transaction.atomic():
        entitlement.used = True
        entitlement.save(update_fields=['used'])
        attempt = SpinAttempt.objects.create(
            user=user, segment=segment, entitlement=entitlement, prize_amount=segment.prize_amount,
        )
    credit_wallet(user, segment.prize_amount, 'spin_wheel', f"Spin wheel: {segment.label}", booking=entitlement.booking)
    return attempt


def redeem_code(user, code):
    code = (code or '').strip().upper()
    with transaction.atomic():
        try:
            redeem = RedeemCode.objects.select_for_update().get(code=code)
        except RedeemCode.DoesNotExist:
            raise ValidationError("Invalid redeem code.")
        if redeem.box_id is not None:
            raise ValidationError(
                f"This code is only valid at checkout for {redeem.box.name} — "
                f"apply it on that box's booking page, not here."
            )
        if not redeem.is_claimable():
            raise ValidationError("This code has already been used or has expired.")
        redeem.is_used = True
        redeem.used_by = user
        redeem.used_at = timezone.now()
        redeem.save(update_fields=['is_used', 'used_by', 'used_at'])
    credit_wallet(user, redeem.value, 'redeem_code', f"Redeemed code {redeem.code}")
    return redeem


def on_booking_completed(booking):
    """The single hook point fired once per booking, right after it's
    marked Completed (see bookings/tasks.py::mark_completed_bookings_task).
    One call site instead of three separate periodic tasks re-querying
    the same completed-bookings set."""
    apply_cashback(booking)
    if ScratchCardAutoGrantSetting.is_enabled() and OwnerScratchCardSetting.is_enabled_for(booking.box.owner):
        grant_scratch_card(booking.user, booking=booking)
    grant_spin_entitlement(booking.user, booking=booking)
