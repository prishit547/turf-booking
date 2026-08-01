# bookings/admin.py
from django.contrib import admin
from .models import Booking

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('user', 'box', 'date', 'start_time', 'end_time', 'total_amount', 'payment_status', 'booking_status', 'created_at')
    list_filter = ('payment_status', 'booking_status', 'date')
    search_fields = ('user__username', 'box__name', 'payment_id') # Adjust 'user__username' if needed
    raw_id_fields = ('user', 'box')
    readonly_fields = ('created_at', 'updated_at', 'payment_id')