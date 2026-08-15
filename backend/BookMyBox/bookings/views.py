# bookings/views.py
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from user.permissions import IsAdminUser
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters

from BookMyBox.rate_limit import check_rate_limit
from BookMyBox.pagination import StandardResultsPagination
from BookMyBox.tasks import send_email_task
from . import broadcasting, reservation, services
from .filters import AdminBookingFilter
from .models import Booking, BookingInvite, Coupon, WaitlistEntry
from .serializers import AdminBookingSerializer, BookingInviteSerializer, BookingSerializer, CouponSerializer, WaitlistEntrySerializer
from .services import BookingWriteError, CancellationError, cancel_booking
from .tasks import expire_hold_task, promote_and_broadcast
from boxes.models import Box
from boxes.pricing import resolve_box_price
from user.notifications import notify

User = get_user_model()

INVITE_TOKEN_TTL_DAYS = 7

# Deliberately tighter than the chatbot's 20/60s: a reserve() call claims a
# real contended resource (or a queue slot for one), not just a chat
# message, so there's less legitimate reason to call it rapidly — a user
# comparing a few time slots in a row is still well within this budget.
RESERVE_RATE_LIMIT = 10
RESERVE_RATE_LIMIT_WINDOW_SECONDS = 60


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return self.queryset
        # A participant who accepted a group-booking invite (see
        # BookingInvite) can see the booking here too, alongside the
        # booker's own rows — but stays read-only: `cancel` below still
        # gates on `booking.user`, not this broadened visibility.
        own_or_participant = Q(user=self.request.user) | Q(
            invites__invited_user=self.request.user, invites__status='accepted',
        )
        # A box owner can retrieve/cancel a booking made *on their box* too
        # (powers the Owner Bookings row -> /booking/:id detail view), but
        # this widening deliberately stays scoped to retrieve/cancel only —
        # NOT list. Widening list would silently merge "bookings I made as
        # a customer" with "bookings on my box" for any owner who also
        # books elsewhere as a customer, which would be a real correctness
        # bug, not just noise.
        if self.action in ('retrieve', 'cancel', 'reschedule'):
            own_or_participant |= Q(box__owner=self.request.user)
        return self.queryset.filter(own_or_participant).distinct().prefetch_related('invites')

    def create(self, request, *args, **kwargs):
        parsed = services.validate_booking_request(request.data)
        try:
            booking = services.create_booking_row(
                request.user, **parsed, coupon_code=request.data.get('couponCode'),
                redeem_code=request.data.get('redeemCode'),
                use_wallet=bool(request.data.get('useWallet')),
            )
        except BookingWriteError as e:
            return Response({'detail': e.detail}, status=e.status_code)
        notify(
            booking.box.owner,
            'New booking received',
            f"{request.user.full_name or request.user.email} booked {booking.box.name} on "
            f"{booking.date} at {booking.start_time}.",
        )
        serializer = self.get_serializer(booking)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def recurring(self, request):
        """Book the same slot weekly for N occurrences in one action.
        Deliberately bypasses the Redis hold/queue system entirely (same
        as the owner-manual booking path in OwnerBookingViewSet.book) —
        these are proactive future bookings, not typically hot-contested
        slots, so N sequential hold+confirm round trips would add
        complexity for no real benefit. Each occurrence is validated and
        written independently so one already-booked week doesn't block
        the rest — partial success is the expected, correct outcome."""
        try:
            weeks = int(request.data.get('weeks'))
        except (TypeError, ValueError):
            return Response({'detail': 'weeks must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        if not (2 <= weeks <= 12):
            return Response({'detail': 'weeks must be between 2 and 12.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            base_date = datetime.strptime(request.data.get('date', ''), '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        box = Box.objects.filter(pk=request.data.get('boxId')).first()

        group_id = uuid.uuid4()
        created, failed = [], []
        for i in range(weeks):
            occurrence_date = base_date + timedelta(weeks=i)
            occurrence_data = {**request.data, 'date': occurrence_date.isoformat()}
            try:
                parsed = services.validate_booking_request(occurrence_data)
                booking = services.create_booking_row(request.user, **parsed, recurring_group_id=group_id)
                created.append(self.get_serializer(booking).data)
            except ValidationError as e:
                reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
                failed.append({'date': occurrence_date.isoformat(), 'reason': str(reason)})
            except BookingWriteError as e:
                failed.append({'date': occurrence_date.isoformat(), 'reason': e.detail})

        if created and box:
            notify(
                box.owner,
                'New recurring booking',
                f"{request.user.full_name or request.user.email} booked {box.name} weekly — "
                f"{len(created)} of {weeks} weeks confirmed starting {base_date}.",
            )

        return Response(
            {'created': created, 'failed': failed, 'group_id': str(group_id)},
            status=status.HTTP_201_CREATED if created else status.HTTP_409_CONFLICT,
        )

    @action(detail=False, methods=['post'], url_path='coupons/validate', permission_classes=[IsAuthenticated])
    def validate_coupon(self, request):
        """Dry-run code check for Checkout's "Apply" button — tries
        services.apply_coupon() first (admin Coupon codes), and if that
        fails, falls back to services.apply_redeem_code() (owner-issued,
        box-scoped RedeemCode codes) before giving up. Neither call
        consumes the code (see each function's docstring) — the real,
        authoritative application happens again inside
        create_booking_row()'s locked transaction; this is purely a preview.
        `kind` tells the frontend which field to forward at confirm time
        (couponCode vs redeemCode)."""
        box = Box.objects.filter(pk=request.data.get('boxId')).first()
        if not box:
            return Response({'valid': False, 'detail': 'Box not found.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            duration_hours = int(request.data.get('duration'))
        except (TypeError, ValueError):
            return Response({'valid': False, 'detail': 'Invalid duration.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking_date = datetime.strptime(request.data.get('date', ''), '%Y-%m-%d').date()
        except ValueError:
            return Response({'valid': False, 'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        start_time_str = request.data.get('startTime', '')
        code = request.data.get('code')

        kind = 'coupon'
        try:
            applied, discount_amount = services.apply_coupon(
                box, duration_hours, code, booking_date, start_time_str,
            )
        except ValidationError:
            kind = 'redeem_code'
            try:
                applied, discount_amount = services.apply_redeem_code(
                    box, duration_hours, code, booking_date, start_time_str,
                )
            except ValidationError as e:
                reason = e.detail[0] if isinstance(e.detail, list) and e.detail else e.detail
                return Response({'valid': False, 'detail': str(reason)}, status=status.HTTP_400_BAD_REQUEST)

        gross = resolve_box_price(box, booking_date, start_time_str) * duration_hours
        return Response({
            'valid': True,
            'kind': kind,
            'code': applied.code,
            'discount_amount': str(discount_amount),
            'final_amount': str(gross - discount_amount),
        })

    @action(detail=False, methods=['post'], url_path='price-preview', permission_classes=[IsAuthenticated])
    def price_preview(self, request):
        """Dry-run price resolution for BoxDetails' live total-estimate,
        mirroring validate_coupon's exact pattern — returns the resolved
        per-hour rate and gross total for a given box/date/startTime/
        duration, so the frontend doesn't have to duplicate
        resolve_box_price()'s peak-pricing lookup in JS."""
        box = Box.objects.filter(pk=request.data.get('boxId')).first()
        if not box:
            return Response({'detail': 'Box not found.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            duration_hours = int(request.data.get('duration'))
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid duration.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking_date = datetime.strptime(request.data.get('date', ''), '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        start_time_str = request.data.get('startTime', '')

        rate = resolve_box_price(box, booking_date, start_time_str)
        return Response({
            'rate_per_hour': str(rate),
            'total': str(rate * duration_hours),
            'is_peak_rate': rate != box.price,
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def invite(self, request, pk=None):
        """Invite someone to a booking the caller made (group/split
        bookings). Only the original booker can invite — a booking visible
        to the caller only via an already-accepted invite (see
        get_queryset()) is read-only, same as `cancel` below. Accepts
        either {invited_user_id} (an existing account, resolved by search)
        or {invited_email} (works even if no account exists yet — the
        invite is claimed on signup/login via the emailed link)."""
        booking = self.get_object()
        if booking.user_id != request.user.id:
            return Response({'detail': 'Only the booker can invite others.'}, status=status.HTTP_403_FORBIDDEN)

        invited_user = None
        invited_user_id = request.data.get('invited_user_id')
        if invited_user_id:
            invited_user = User.objects.filter(pk=invited_user_id).first()
            if not invited_user:
                return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)
            invited_email = invited_user.email
        else:
            invited_email = (request.data.get('invited_email') or '').strip().lower()
            if not invited_email:
                return Response({'detail': 'invited_user_id or invited_email is required.'}, status=status.HTTP_400_BAD_REQUEST)
            # An existing account with this email can skip the claim step
            # entirely — resolve it now so they see the invite in-app
            # immediately, same as being invited by search.
            invited_user = User.objects.filter(email__iexact=invited_email).first()

        if invited_user and invited_user.id == request.user.id:
            return Response({'detail': "You can't invite yourself."}, status=status.HTTP_400_BAD_REQUEST)

        invite = BookingInvite.objects.create(
            booking=booking, invited_by=request.user, invited_user=invited_user,
            invited_email=invited_email, expires_at=timezone.now() + timedelta(days=INVITE_TOKEN_TTL_DAYS),
        )

        claim_link = f"{settings.FRONTEND_URL}/invites/{invite.token}"
        send_email_task.delay(
            invited_email,
            f"{request.user.full_name or request.user.email} invited you to a booking",
            f"<p>{request.user.full_name or request.user.email} invited you to join their booking at "
            f"{booking.box.name} on {booking.date} at {booking.start_time}.</p>"
            f'<p><a href="{claim_link}">{claim_link}</a></p>'
            f"<p>This invite expires in {INVITE_TOKEN_TTL_DAYS} days.</p>",
        )
        if invited_user:
            notify(
                invited_user,
                "You're invited to a booking",
                f"{request.user.full_name or request.user.email} invited you to join their booking at "
                f"{booking.box.name} on {booking.date} at {booking.start_time}.",
                link=f'/invites/{invite.token}',
            )

        return Response(BookingInviteSerializer(invite).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='invites/(?P<token>[^/.]+)', permission_classes=[AllowAny])
    def invite_detail(self, request, token=None):
        """Public lookup so the /invites/:token landing page can show
        "X invited you to Y" before the visitor is authenticated — accept/
        decline themselves still require login."""
        invite = get_object_or_404(BookingInvite, token=token)
        return Response({
            'valid': invite.is_claimable(),
            'status': invite.status,
            'invited_by_name': invite.invited_by.full_name or invite.invited_by.email,
            'box_name': invite.booking.box.name,
            'date': invite.booking.date,
            'start_time': invite.booking.start_time,
            'duration': invite.booking.duration,
        })

    @action(detail=False, methods=['post'], url_path='invites/(?P<token>[^/.]+)/accept', permission_classes=[IsAuthenticated])
    def accept_invite(self, request, token=None):
        invite = get_object_or_404(BookingInvite, token=token)
        if not invite.is_claimable():
            return Response({'detail': 'This invite is no longer valid.'}, status=status.HTTP_409_CONFLICT)

        invite.invited_user = request.user
        invite.status = 'accepted'
        invite.responded_at = timezone.now()
        invite.save(update_fields=['invited_user', 'status', 'responded_at'])

        notify(
            invite.invited_by,
            'Invite accepted',
            f"{request.user.full_name or request.user.email} accepted your invite to "
            f"{invite.booking.box.name} on {invite.booking.date} at {invite.booking.start_time}.",
        )
        return Response(self.get_serializer(invite.booking).data)

    @action(detail=False, methods=['post'], url_path='invites/(?P<token>[^/.]+)/decline', permission_classes=[IsAuthenticated])
    def decline_invite(self, request, token=None):
        invite = get_object_or_404(BookingInvite, token=token)
        if not invite.is_claimable():
            return Response({'detail': 'This invite is no longer valid.'}, status=status.HTTP_409_CONFLICT)

        invite.status = 'declined'
        invite.responded_at = timezone.now()
        invite.save(update_fields=['status', 'responded_at'])

        notify(
            invite.invited_by,
            'Invite declined',
            f"{request.user.full_name or request.user.email} declined your invite to "
            f"{invite.booking.box.name} on {invite.booking.date} at {invite.booking.start_time}.",
        )
        return Response({'status': 'declined'})

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

        if (
            booking.user != request.user
            and request.user.role != 'admin'
            and booking.box.owner_id != request.user.id
        ):
            return Response({'detail': 'You do not have permission to cancel this booking.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            cancel_booking(booking, cancelled_by=request.user, reason=request.data.get('reason'))
        except CancellationError as e:
            return Response({'detail': e.detail}, status=e.status_code)

        serializer = self.get_serializer(booking)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def reschedule(self, request, pk=None):
        """Move a Confirmed booking to a new date/start_time — box and
        duration stay fixed, so total_amount never changes. Same permission
        shape as `cancel` above (the booking's own customer, an admin, or
        the box's owner), and same get_object() scoping widened for this
        action in get_queryset()."""
        booking = self.get_object()

        if (
            booking.user != request.user
            and request.user.role != 'admin'
            and booking.box.owner_id != request.user.id
        ):
            return Response({'detail': 'You do not have permission to reschedule this booking.'}, status=status.HTTP_403_FORBIDDEN)

        date_str = request.data.get('date')
        start_time_str = request.data.get('start_time') or request.data.get('startTime')
        if not date_str or not start_time_str:
            return Response({'detail': 'date and start_time are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            services.reschedule_booking(
                booking, rescheduled_by=request.user, new_date=new_date, new_start_time_str=start_time_str,
            )
        except services.RescheduleError as e:
            return Response({'detail': e.detail}, status=e.status_code)

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

        parsed = services.validate_booking_request(request.data)

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
        in create_booking_row remains authoritative — Redis said this user
        may proceed, but the DB gets the final word (see the module-level
        scoping-decision note in reservation.py for why that can matter)."""
        result = reservation.confirm_reservation(hold_token, user_id=request.user.id)
        if result.status == 'invalid':
            return Response(
                {'detail': 'Your hold has expired or is invalid. Please try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        slot = reservation.parse_slot_signature(result.sig)
        slot_date = datetime.strptime(slot['date'], '%Y-%m-%d').date()
        try:
            booking = services.create_booking_row(
                user=request.user,
                box_id=slot['box_id'],
                booking_date=slot_date,
                start_time_str=slot['start_time'],
                duration_hours=slot['duration'],
                end_time_str=services.compute_end_time_str(
                    slot_date,
                    slot['start_time'],
                    slot['duration'],
                ),
                coupon_code=request.data.get('couponCode'),
                redeem_code=request.data.get('redeemCode'),
                use_wallet=bool(request.data.get('useWallet')),
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
        notify(
            booking.box.owner,
            'New booking received',
            f"{request.user.full_name or request.user.email} booked {booking.box.name} on "
            f"{booking.date} at {booking.start_time}.",
        )
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
        elif self.action in ('booked_slots', 'invite_detail'):
            self.permission_classes = []
        else:
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()


class AdminBookingViewSet(viewsets.ReadOnlyModelViewSet):
    """Dedicated paginated/filterable/searchable bookings list for the admin
    Bookings tab — separate from BookingViewSet (which is the booking
    customer's own CRUD surface) so admin-scale listing doesn't have to
    contend with that viewset's per-user get_queryset()."""
    serializer_class = AdminBookingSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = AdminBookingFilter
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'box__name', 'box__owner__email']
    ordering_fields = ['date', 'created_at', 'total_amount']
    ordering = ['-created_at']

    def get_queryset(self):
        return Booking.objects.select_related('user', 'box', 'box__owner').all()


class AdminCouponViewSet(viewsets.ModelViewSet):
    """Admin CRUD for discount coupons — create/list/deactivate. Mounted at
    its own 'admin/coupons' router prefix, included before the base
    BookingViewSet router in urls.py, same collision-avoidance reasoning
    already documented there for AdminBookingViewSet."""
    serializer_class = CouponSerializer
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsPagination
    queryset = Coupon.objects.all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class WaitlistViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """A user's own persistent "notify me if this slot opens up" signups —
    distinct from the short-lived Redis hold/queue in reservation.py, which
    only matters during an active checkout. See _notify_and_clear_waitlist()
    in services.py for the notify+clear-on-cancel side of this."""
    serializer_class = WaitlistEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WaitlistEntry.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        box_id = request.data.get('boxId') or request.data.get('box')
        date_str = request.data.get('date')
        start_time = request.data.get('startTime') or request.data.get('start_time')
        duration = request.data.get('duration')
        if not all([box_id, date_str, start_time, duration]):
            return Response(
                {'detail': 'boxId, date, startTime, and duration are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Waitlisting only makes sense for a slot that's actually taken —
        # an open slot should just be booked directly.
        already_booked = Booking.objects.filter(
            box_id=box_id, date=date_str, start_time=start_time,
            booking_status__in=['Confirmed', 'Completed'],
        ).exists()
        if not already_booked:
            return Response({'detail': 'This slot is not currently booked.'}, status=status.HTTP_400_BAD_REQUEST)

        entry, created = WaitlistEntry.objects.get_or_create(
            user=request.user, box_id=box_id, date=date_str, start_time=start_time, duration=duration,
        )
        return Response(
            self.get_serializer(entry).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """Just the slot signatures (+id, so the caller can un-waitlist)
        the frontend needs to know which booked slots already show 'On
        waitlist' — cheaper than the full list() with its box_name lookups.
        Optional ?box=<id> narrows to one box, since BoxDetails.jsx only
        ever cares about its own box's slots."""
        entries = self.get_queryset()
        box_id = request.query_params.get('box')
        if box_id:
            entries = entries.filter(box_id=box_id)
        entries = entries.values('id', 'box_id', 'date', 'start_time', 'duration')
        return Response(list(entries))