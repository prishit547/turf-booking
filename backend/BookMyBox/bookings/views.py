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

from BookMyBox.rate_limit import check_rate_limit
from . import broadcasting, reservation
from .models import Booking
from .serializers import BookingSerializer
from .tasks import expire_hold_task, promote_and_broadcast
from boxes.models import Box

# Deliberately tighter than the chatbot's 20/60s: a reserve() call claims a
# real contended resource (or a queue slot for one), not just a chat
# message, so there's less legitimate reason to call it rapidly — a user
# comparing a few time slots in a row is still well within this budget.
RESERVE_RATE_LIMIT = 10
RESERVE_RATE_LIMIT_WINDOW_SECONDS = 60


class BookingWriteError(Exception):
    """Raised by _create_booking_row for any expected failure (box missing,
    not approved, overlap conflict) so both create() and confirm() can share
    one code path for turning it into an HTTP response, instead of each
    reimplementing the same box-lock-and-check logic."""

    def __init__(self, detail, status_code):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


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

    def _compute_end_time_str(self, booking_date, start_time_str, duration_hours):
        start_time_obj = self._parse_time(start_time_str)
        start_datetime = datetime.combine(booking_date, start_time_obj)
        end_datetime = start_datetime + timedelta(hours=duration_hours)
        # Bookings must end by 23:00 at the latest
        if end_datetime.hour > 23 or (end_datetime.hour == 23 and end_datetime.minute > 0):
            raise ValidationError("Booking cannot extend past 23:00.")
        return end_datetime.time().strftime("%H:%M")

    def _validate_booking_request(self, data):
        """Shared by create() (direct booking) and reserve() (two-phase
        hold/queue booking) — both accept the same {boxId, date, startTime,
        duration} shape and need identical validation."""
        box_id = data.get('boxId')
        date_str = data.get('date')
        start_time_str = data.get('startTime')
        duration_hours = data.get('duration')

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

        end_time_str = self._compute_end_time_str(booking_date, start_time_str, duration_hours)

        try:
            box = Box.objects.get(pk=box_id)
        except Box.DoesNotExist:
            raise ValidationError("Box not found.")

        if start_time_str < box.opening_time or end_time_str > box.closing_time:
            raise ValidationError(
                f"This facility is only bookable between {box.opening_time} and {box.closing_time}."
            )

        return {
            'box_id': box_id,
            'booking_date': booking_date,
            'start_time_str': start_time_str,
            'duration_hours': duration_hours,
            'end_time_str': end_time_str,
        }

    def _create_booking_row(self, user, box_id, booking_date, start_time_str, duration_hours, end_time_str):
        """The existing transaction.atomic() + select_for_update() + overlaps()
        DB write — the authoritative safety net, reused as-is by both create()
        (direct booking) and confirm() (two-phase hold/queue booking) rather
        than reimplemented. Redis (reservation.py) is a fast-path/UX layer on
        top of this, never a replacement for it."""
        with transaction.atomic():
            # Lock the box row to prevent race conditions while checking availability.
            try:
                box = Box.objects.select_for_update().get(pk=box_id)
            except Box.DoesNotExist:
                raise BookingWriteError("Box not found.", status.HTTP_400_BAD_REQUEST)

            if box.status != 'approved':
                raise BookingWriteError("This facility is not available for booking yet.", status.HTTP_400_BAD_REQUEST)

            expected_total_amount = box.price * duration_hours

            # Check overlap against all non-cancelled bookings for this box/date.
            existing_bookings = Booking.objects.filter(
                box=box,
                date=booking_date,
                booking_status__in=['Confirmed', 'Completed']
            )

            if any(existing.overlaps(booking_date, start_time_str, end_time_str) for existing in existing_bookings):
                raise BookingWriteError("This time slot overlaps with an existing booking.", status.HTTP_409_CONFLICT)

            return Booking.objects.create(
                user=user,
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

    def create(self, request, *args, **kwargs):
        parsed = self._validate_booking_request(request.data)
        try:
            booking = self._create_booking_row(request.user, **parsed)
        except BookingWriteError as e:
            return Response({'detail': e.detail}, status=e.status_code)
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

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def reserve(self, request):
        """First phase of the two-phase reservation flow: atomically claim a
        contended slot (short-lived hold, time to confirm) or join its FIFO
        wait queue. See bookings/reservation.py for the Redis mechanics —
        this view only does the DB pre-check and schedules the hold's expiry."""
        # Checked before any other work, same as the chatbot's rate limiter —
        # reject cheaply rather than doing validation/Redis work for a
        # request we're going to refuse anyway. Without this, nothing stops
        # a user from spamming holds across many boxes to grief other users
        # (hold, let it sit until TTL, repeat).
        rate_limit_key = f"reserve_ratelimit_user_{request.user.id}"
        if not check_rate_limit(rate_limit_key, RESERVE_RATE_LIMIT, RESERVE_RATE_LIMIT_WINDOW_SECONDS):
            return Response(
                {'detail': "You're reserving slots too quickly. Please wait a moment and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        parsed = self._validate_booking_request(request.data)

        # Cheap read-only pre-check: if a real booking already covers this
        # exact slot, don't even touch Redis.
        already_booked = Booking.objects.filter(
            box_id=parsed['box_id'],
            date=parsed['booking_date'],
            start_time=parsed['start_time_str'],
            booking_status__in=['Confirmed', 'Completed'],
        ).exists()
        if already_booked:
            return Response({'detail': 'This time slot is already booked.'}, status=status.HTTP_409_CONFLICT)

        result = reservation.reserve_slot(
            box_id=parsed['box_id'],
            date=parsed['booking_date'].isoformat(),
            start_time=parsed['start_time_str'],
            duration=parsed['duration_hours'],
            user_id=request.user.id,
        )

        if result.status == 'held':
            expire_hold_task.apply_async(
                args=[result.hold_token],
                eta=reservation.expires_at_to_eta(result.expires_at),
            )
            return Response({
                'status': 'held',
                'hold_token': result.hold_token,
                'expires_at': result.expires_at,
            }, status=status.HTTP_201_CREATED)

        return Response({
            'status': 'queued',
            'hold_token': result.hold_token,
            'position': result.position,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='confirm/(?P<hold_token>[^/.]+)', permission_classes=[IsAuthenticated])
    def confirm(self, request, hold_token=None):
        """Second phase: finalize a held slot into a real Booking row. The
        DB-level transaction.atomic()+select_for_update()+overlaps() check
        in _create_booking_row remains authoritative — Redis said this user
        may proceed, but the DB gets the final word (see the module-level
        scoping-decision note in reservation.py for why that can matter)."""
        result = reservation.confirm_reservation(hold_token, user_id=request.user.id)
        if result.status == 'invalid':
            return Response(
                {'detail': 'Your hold has expired or is invalid. Please try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        slot = reservation.parse_slot_signature(result.sig)
        try:
            booking = self._create_booking_row(
                user=request.user,
                box_id=slot['box_id'],
                booking_date=datetime.strptime(slot['date'], '%Y-%m-%d').date(),
                start_time_str=slot['start_time'],
                duration_hours=slot['duration'],
                end_time_str=self._compute_end_time_str(
                    datetime.strptime(slot['date'], '%Y-%m-%d').date(),
                    slot['start_time'],
                    slot['duration'],
                ),
            )
        except BookingWriteError as e:
            # Redis said we could confirm, but the DB's authoritative check
            # says no (the cross-signature overlap gap noted in
            # reservation.py, or a genuine bug) — release the hold so the
            # queue isn't left stuck waiting behind a dead end.
            release_result = reservation.release_hold(hold_token)
            promote_and_broadcast(release_result, result.sig)
            return Response({'detail': e.detail}, status=e.status_code)

        # Confirming permanently takes the slot — anyone still queued needs
        # a "sorry, taken" notice, not a promotion (there's nothing left to
        # promote them into). The confirming user is still a member of this
        # same group (their socket's been open since they placed the hold),
        # so they receive their own broadcast too — booked_by_user_id lets
        # the frontend tell that apart from an actual "someone else took it".
        broadcasting.broadcast_slot_booked(result.sig, request.user.id)
        serializer = self.get_serializer(booking)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='release_hold/(?P<hold_token>[^/.]+)', permission_classes=[IsAuthenticated])
    def release_hold(self, request, hold_token=None):
        """Explicit 'give up my hold/spot in queue' action — promotes the
        next queued user immediately rather than making them wait out the
        full TTL for no reason."""
        meta = reservation.get_holdmeta(hold_token)
        if meta is None:
            return Response({'detail': 'Hold not found or already gone.'}, status=status.HTTP_404_NOT_FOUND)
        if meta['user_id'] != str(request.user.id):
            return Response({'detail': 'You do not hold this reservation.'}, status=status.HTTP_403_FORBIDDEN)

        result = reservation.release_hold(hold_token)
        promote_and_broadcast(result, meta['sig'])
        return Response({'status': result.status}, status=status.HTTP_200_OK)

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
        # This unconditionally overrides every action's own @action(...,
        # permission_classes=...) below, which is why booked_slots (meant
        # to be public — real anonymous users check slot availability
        # before ever logging in) needs its own branch here instead of
        # falling into the catch-all IsAuthenticated default.
        if self.action in ['list', 'retrieve']:
            self.permission_classes = [IsAuthenticated]
        elif self.action == 'destroy':
            self.permission_classes = [IsAdminUser]
        elif self.action == 'booked_slots':
            self.permission_classes = []
        else:
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()