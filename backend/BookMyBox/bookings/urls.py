# bookings/urls.py

from django.urls import include, path
from rest_framework.routers import DefaultRouter, SimpleRouter
from .views import AdminBookingViewSet, AdminCouponViewSet, BookingViewSet, WaitlistViewSet

# BookingViewSet is registered at the root prefix (r''), and DRF's default
# `pk` regex isn't digit-restricted — so AdminBookingViewSet must be mounted
# under its own router at an explicit 'admin/' path, included BEFORE the
# root router below, or a request to /bookings/admin/ would instead get
# swallowed by BookingViewSet's own <pk> detail route (treating "admin" as
# a booking id).
admin_router = DefaultRouter()
admin_router.register(r'', AdminBookingViewSet, basename='admin-booking')

# Same reasoning again: admin_router above owns 'admin/' + 'admin/<pk>/',
# whose non-digit-restricted <pk> would swallow 'admin/coupons/' (treating
# "coupons" as a booking id) if this were included after it. Its own router
# at the explicit 'admin/coupons' prefix, included first, avoids that.
#
# Deliberately SimpleRouter, not DefaultRouter, here: DefaultRouter always
# appends its own browsable-API "root" view at pattern ^$ in addition to
# whatever's register()'d. Since this router registers at a non-root prefix
# ('admin/coupons', not ''), that ^$ pattern has nothing to be shadowed by
# within this router's own url list — so when included at path('', ...)
# below (mounted first), that ^$ becomes the literal 'bookings/' root and
# silently shadows BookingViewSet's own real create()/list endpoint, which
# is registered later. Caught this exact bug via a live curl test — POST
# /api/bookings/ started returning 405 the moment this router was added.
admin_coupon_router = SimpleRouter()
admin_coupon_router.register(r'admin/coupons', AdminCouponViewSet, basename='admin-coupon')

# Same reasoning again for 'waitlist/' — SimpleRouter (no auto ^$ root) at
# its own explicit prefix, included before the base router.
waitlist_router = SimpleRouter()
waitlist_router.register(r'waitlist', WaitlistViewSet, basename='waitlist')

router = DefaultRouter()
router.register(r'', BookingViewSet, basename='booking') # 'basename' important here too

urlpatterns = [
    path('', include(admin_coupon_router.urls)),
    path('', include(waitlist_router.urls)),
    path('admin/', include(admin_router.urls)),
    path('', include(router.urls)),
]