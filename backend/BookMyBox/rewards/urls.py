# rewards/urls.py
from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import (
    AdminCashbackRuleViewSet, AdminRedeemCodeViewSet, AdminRewardsOverviewView,
    AdminScratchCardConfigViewSet, AdminSpinWheelSegmentViewSet, RedeemCodeView,
    ScratchCardViewSet, SpinWheelView, WalletTransactionListView, WalletView,
)

# All SimpleRouter (no auto ^$ browsable-API root to shadow anything) at
# their own explicit prefixes — same collision-avoidance convention
# documented in bookings/urls.py and boxes/urls.py.
wallet_txn_router = SimpleRouter()
wallet_txn_router.register(r'wallet/transactions', WalletTransactionListView, basename='wallet-transaction')

scratch_card_router = SimpleRouter()
scratch_card_router.register(r'scratch-cards', ScratchCardViewSet, basename='scratch-card')

admin_cashback_router = SimpleRouter()
admin_cashback_router.register(r'admin/cashback-rules', AdminCashbackRuleViewSet, basename='admin-cashback-rule')

admin_scratch_config_router = SimpleRouter()
admin_scratch_config_router.register(r'admin/scratch-card-configs', AdminScratchCardConfigViewSet, basename='admin-scratch-card-config')

admin_spin_router = SimpleRouter()
admin_spin_router.register(r'admin/spin-wheel-segments', AdminSpinWheelSegmentViewSet, basename='admin-spin-wheel-segment')

admin_redeem_router = SimpleRouter()
admin_redeem_router.register(r'admin/redeem-codes', AdminRedeemCodeViewSet, basename='admin-redeem-code')

urlpatterns = [
    path('wallet/', WalletView.as_view(), name='wallet'),
    path('spin/', SpinWheelView.as_view(), name='spin-wheel'),
    path('redeem/', RedeemCodeView.as_view(), name='redeem-code'),
    path('admin/overview/', AdminRewardsOverviewView.as_view(), name='admin-rewards-overview'),
    path('', include(wallet_txn_router.urls)),
    path('', include(scratch_card_router.urls)),
    path('', include(admin_cashback_router.urls)),
    path('', include(admin_scratch_config_router.urls)),
    path('', include(admin_spin_router.urls)),
    path('', include(admin_redeem_router.urls)),
]
