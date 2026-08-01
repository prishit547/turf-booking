# bookings/views.py
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.db import transaction
from rest_framework.decorators import action
from user.permissions import IsAdminUser
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import datetime, timedelta, time, date
from django.conf import settings

from .models import Booking
from .serializers import BookingSerializer
from boxes.models import Box


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return self.queryset
        return self.queryset.filter(user=self.request.user)

    def _parse_time(self, time_str):
        try:
            hour, minute = map(int, time_str.split(':'))
            return time(hour, minute)
        except (ValueError, IndexError, AttributeError):
            raise ValidationError("Invalid time format. Use HH:MM.")

    def create(self, request, *args, **kwargs):
        box_id = request.data.get('boxId')
        date_str = request.data.get('date')
        start_time_str = request.data.get('startTime')
        duration_hours = request.data.get('duration')

        if not all([box_id, date_str, start_time_str, duration_hours]):
            raise ValidationError("Missing required booking details (boxId, date, startTime, duration).")

        try:
            duration_hours = int(duration_hours)
            if not (1 <= duration_hours <= 6):
                raise ValidationError("Duration must be between 1 and 6 hours.")
        except (ValueError, TypeError):
            raise ValidationError("Invalid duration format.")

        try:
            booking_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError("Invalid date format. Use YYYY-MM-DD.")

        if booking_date < timezone.now().date():
            raise ValidationError("Cannot book a slot in the past.")

        start_time_obj = self._parse_time(start_time_str)
        start_datetime = datetime.combine(booking_date, start_time_obj)
        end_datetime = start_datetime + timedelta(hours=duration_hours)
        end_time_obj = end_datetime.time()

        # Bookings must end by 23:00 at the latest
        if end_datetime.hour > 23 or (end_datetime.hour == 23 and end_datetime.minute > 0):
            raise ValidationError("Booking cannot extend past 23:00.")

        end_time_str = end_time_obj.strftime("%H:%M")

        with transaction.atomic():
            # Lock the box row to prevent race conditions while checking availability.
            try:
                box = Box.objects.select_for_update().get(pk=box_id)
            except Box.DoesNotExist:
                raise ValidationError("Box not found.")

            if box.status != 'approved':
                raise ValidationError("This facility is not available for booking yet.")

            expected_total_amount = box.price * duration_hours

            # Check overlap against all non-cancelled bookings for this box/date.
            existing_bookings = Booking.objects.filter(
                box=box,
                date=booking_date,
                booking_status__in=['Confirmed', 'Completed']
            )

            if any(existing.overlaps(booking_date, start_time_str, end_time_str) for existing in existing_bookings):
                raise ValidationError("This time slot overlaps with an existing booking.")

            booking = Booking.objects.create(
                user=request.user,
                box=box,
                date=booking_date,
                start_time=start_time_str,
                end_time=end_time_str,
                duration=duration_hours,
                total_amount=expected_total_amount,
                payment_status='Not Required',
                payment_id=None,
                booking_status='Confirmed'
            )
            serializer = self.get_serializer(booking)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        # Disallow full updates on bookings; use cancellation or create a new booking instead.
        return Response(
            {"detail": "Booking updates are not allowed. Please cancel and create a new booking."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Booking updates are not allowed. Please cancel and create a new booking."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        
        if booking.user != request.user and request.user.role != 'admin':
            return Response({'detail': 'You do not have permission to cancel this booking.'}, status=status.HTTP_403_FORBIDDEN)

        # Timezone-aware cancellation deadline check
        booking_dt = datetime.combine(booking.date, time.fromisoformat(booking.start_time))
        if settings.USE_TZ:
            booking_dt = timezone.make_aware(booking_dt)
        now = timezone.now()

        if now > booking_dt - timedelta(hours=2):
            return Response({'detail': 'Cancellation not allowed within 2 hours of booking time.'}, status=status.HTTP_400_BAD_REQUEST)

        if booking.booking_status == 'Cancelled':
            return Response({'detail': 'Booking already cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

        booking.booking_status = 'Cancelled'
        booking.save()
        serializer = self.get_serializer(booking) 
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[])
    def booked_slots(self, request):
        """
        Get booked time slots for a specific box and date
        Query params: box_id, date (YYYY-MM-DD format)
        """
        box_id = request.query_params.get('box_id')
        date_str = request.query_params.get('date')
        
        if not box_id or not date_str:
            return Response({
                'error': 'box_id and date parameters are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Validate date format
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return Response({
                'error': 'Invalid date format. Use YYYY-MM-DD'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            box = Box.objects.get(pk=box_id)
        except Box.DoesNotExist:
            return Response({
                'error': 'Box not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get all confirmed/completed bookings for this box and date
        bookings = Booking.objects.filter(
            box=box,
            date=date_str,
            booking_status__in=['Confirmed', 'Completed']
        ).values('start_time', 'end_time', 'duration')
        
        # Convert to list of booked time slots
        booked_slots = []
        for booking in bookings:
            start_time = booking['start_time']
            duration = booking['duration']
            
            # Generate all time slots covered by this booking
            start_hour = int(start_time.split(':')[0])
            start_minute = int(start_time.split(':')[1])
            
            for i in range(duration):
                slot_hour = start_hour + i
                if slot_hour < 24:  # Don't go past midnight
                    slot_time = f"{slot_hour:02d}:{start_minute:02d}"
                    booked_slots.append(slot_time)
        
        return Response({
            'box_id': box_id,
            'date': date_str,
            'booked_slots': booked_slots
        }, status=status.HTTP_200_OK)

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_classes = [IsAuthenticated]
        elif self.action in ['destroy']:
            self.permission_classes = [IsAdminUser]
        else: 
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()