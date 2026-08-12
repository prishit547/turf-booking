# owner_dashboard/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import OwnerAnalyticsView, OwnerBookingViewSet, OwnerDashboardAPIView, PayoutViewSet

router = DefaultRouter()
router.register(r'bookings', OwnerBookingViewSet, basename='owner-booking')
router.register(r'payouts', PayoutViewSet, basename='payout')

urlpatterns = [
    # A single endpoint to get all dashboard data at once
    path('stats/', OwnerDashboardAPIView.as_view(), name='owner-dashboard-stats'),
    path('analytics/', OwnerAnalyticsView.as_view(), name='owner-analytics'),
    path('', include(router.urls)),
]