# boxes/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter, SimpleRouter
from .views import (
    PublicBoxViewSet, OwnerBoxViewSet, AdminBoxViewSet, AdminCommissionRateViewSet,
    AdminPlatformCommissionView, AdminReviewViewSet, BlockedDateViewSet, PricingRuleViewSet,
)

# Router for the public-facing API (listing, searching boxes)
public_router = DefaultRouter()
public_router.register(r'public', PublicBoxViewSet, basename='public-box')

# Router for the owner-specific API (creating, managing their own boxes)
owner_router = DefaultRouter()
owner_router.register(r'owner', OwnerBoxViewSet, basename='owner-box')

# Router for admin review moderation — a distinct 'admin/reviews' prefix, so
# it never collides with the explicit admin/<int:pk>/approve|reject paths
# below (those only match all-digit pk segments).
admin_review_router = DefaultRouter()
admin_review_router.register(r'admin/reviews', AdminReviewViewSet, basename='admin-review')

# SimpleRouter (not DefaultRouter) deliberately, same collision-avoidance
# reasoning documented in bookings/urls.py — no auto ^$ browsable-API root
# to potentially shadow a real endpoint.
blocked_date_router = SimpleRouter()
blocked_date_router.register(r'blocked-dates', BlockedDateViewSet, basename='blocked-date')

# Same reasoning again for 'pricing-rules/'.
pricing_rule_router = SimpleRouter()
pricing_rule_router.register(r'pricing-rules', PricingRuleViewSet, basename='pricing-rule')

# Same reasoning again for 'admin/commission-rates/' — its own explicit
# prefix, included before the admin/<int:pk>/... paths below.
admin_commission_rate_router = SimpleRouter()
admin_commission_rate_router.register(r'admin/commission-rates', AdminCommissionRateViewSet, basename='admin-commission-rate')

urlpatterns = [
    path('', include(public_router.urls)),
    path('', include(owner_router.urls)),
    path('', include(admin_review_router.urls)),
    path('', include(blocked_date_router.urls)),
    path('', include(pricing_rule_router.urls)),
    path('', include(admin_commission_rate_router.urls)),
    path('admin/pending/', AdminBoxViewSet.as_view({'get': 'list_pending'}), name='admin-pending-boxes'),
    path('admin/<int:pk>/approve/', AdminBoxViewSet.as_view({'post': 'approve'}), name='admin-approve-box'),
    path('admin/<int:pk>/reject/', AdminBoxViewSet.as_view({'post': 'reject'}), name='admin-reject-box'),
    path('admin/<int:pk>/request-changes/', AdminBoxViewSet.as_view({'post': 'request_changes'}), name='admin-request-changes-box'),
    path('admin/commission-default/', AdminPlatformCommissionView.as_view(), name='admin-commission-default'),
]
