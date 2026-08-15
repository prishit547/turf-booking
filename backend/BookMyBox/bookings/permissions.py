# bookings/permissions.py
from rest_framework import permissions


class IsCustomerUser(permissions.BasePermission):
    """Gates the customer-facing booking-*creation* actions on
    BookingViewSet (create/recurring/reserve/confirm) to role='user'
    accounts only.

    Admin and facility-owner accounts keep every other booking capability
    untouched: they can still view/cancel/reschedule bookings (see
    BookingViewSet.get_queryset()'s widened owner grant, and admin's
    unrestricted queryset), and an owner can still create a walk-in
    booking on their own box via OwnerBookingViewSet.book — that view has
    its own IsOwnerUser permission class and never touches this one. What
    neither can do is act as a *customer* and book/pay for a slot for
    themselves through the player-facing flow.
    """
    message = (
        "Only customer accounts can book a slot. Facility owners can add "
        "walk-in bookings from their dashboard."
    )

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == 'user'
        )
