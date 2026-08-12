# bookings/filters.py
import django_filters

from .models import Booking


class AdminBookingFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name='booking_status', lookup_expr='exact')
    date_from = django_filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='date', lookup_expr='lte')
    box = django_filters.NumberFilter(field_name='box_id')

    class Meta:
        model = Booking
        fields = ['status', 'date_from', 'date_to', 'box']


class OwnerBookingFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name='booking_status', lookup_expr='exact')
    date_from = django_filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='date', lookup_expr='lte')
    box = django_filters.NumberFilter(field_name='box_id')

    class Meta:
        model = Booking
        fields = ['status', 'date_from', 'date_to', 'box']
