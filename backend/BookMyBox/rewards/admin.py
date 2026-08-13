from django.contrib import admin

from .models import (
    CashbackRule, RedeemCode, ScratchCard, ScratchCardConfig,
    SpinAttempt, SpinEntitlement, SpinWheelSegment, Wallet, WalletTransaction,
)

admin.site.register(Wallet)
admin.site.register(WalletTransaction)
admin.site.register(CashbackRule)
admin.site.register(ScratchCardConfig)
admin.site.register(ScratchCard)
admin.site.register(SpinWheelSegment)
admin.site.register(SpinEntitlement)
admin.site.register(SpinAttempt)
admin.site.register(RedeemCode)
