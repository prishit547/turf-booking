# owner_dashboard/views.py

import csv
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db import models
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Avg, Count, DecimalField, FloatField, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings import broadcasting, reservation
from bookings.filters import OwnerBookingFilter
from bookings.models import Booking
from bookings.serializers import OwnerBookingSerializer
from bookings.services import BookingWriteError, CancellationError, cancel_booking, create_booking_row, validate_booking_request
from boxes.models import Box
from user.audit import log_admin_action
from user.models import OwnerPayoutDetails, User
from user.notifications import notify
from user.permissions import IsAdminOrOwner, IsOwnerUser
from user.serializers import OwnerPayoutDetailsSerializer
from BookMyBox.pagination import StandardResultsPagination
from .models import Payout, PayoutSchedule
from .serializers import OwnerDashboardStatsSerializer, PayoutScheduleSerializer, PayoutSerializer
from .services import (
    EARNINGS_PERIODS, _add_months, compute_owner_earnings, resolve_period,
)

# Caps one bulk-cancel request, since each cancellation fans out into a
# refund + notification.
MAX_BULK_CANCEL = 100


class OwnerDashboardAPIView(APIView):
    permission_classes = [IsAdminOrOwner]

    def get(self, request, *args, **kwargs):
        user = request.user
        if user.role == 'admin':
            all_owner_boxes = Box.objects.all().order_by("-submitted_at")
        else:
            all_owner_boxes = Box.objects.filter(owner=user).order_by("-submitted_at")
        approved_boxes = all_owner_boxes.filter(status="approved")
        pending_boxes = all_owner_boxes.filter(status="pending")
        rejected_boxes = all_owner_boxes.filter(status="rejected")

        # Key Metrics
        stats = approved_boxes.aggregate(
            total_revenue=Coalesce(
                Sum("bookings__total_amount", filter=Q(bookings__booking_status__in=["Completed", "Confirmed"])),
                0.0,
                output_field=DecimalField(),
            ),
            total_bookings=Coalesce(
                Count("bookings", filter=Q(bookings__booking_status__in=["Completed", "Confirmed"])),
                0,
            ),
            avg_rating=Coalesce(Avg("reviews__rating"), 0.0, output_field=DecimalField()),
        )

        # Chart Data
        sports_count = defaultdict(int)
        for box in all_owner_boxes:
            if hasattr(box, 'sports') and isinstance(box.sports, list):
                for sport in box.sports:
                    sports_count[sport] += 1
            elif hasattr(box, 'sport') and box.sport:
                sports_count[box.sport] += 1

        # Revenue and bookings charts for the last 6 complete months (including
        # current) — one grouped query for revenue+bookings instead of two
        # queries per month.
        today = timezone.now().date()
        months = []
        for i in range(5, -1, -1):
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1
            months.append(date(year, month, 1))

        trend_rows = {
            row["month"]: row
            for row in Booking.objects.filter(
                box__in=approved_boxes,
                date__gte=months[0],
                booking_status__in=["Completed", "Confirmed"],
            )
            .annotate(month=TruncMonth("date")).values("month")
            .annotate(
                revenue=Coalesce(Sum("total_amount"), 0.0, output_field=DecimalField()),
                bookings=Count("id"),
            )
        }

        revenue_chart_labels = []
        revenue_chart_data = []
        bookings_chart_data = []
        for month_start in months:
            revenue_chart_labels.append(month_start.strftime("%b"))
            row = trend_rows.get(month_start)
            revenue_chart_data.append(float(row["revenue"]) if row else 0.0)
            bookings_chart_data.append(row["bookings"] if row else 0)

        bookings_chart_labels = revenue_chart_labels

        # Recent Bookings
        recent_bookings_qs = (
            Booking.objects.filter(box__in=all_owner_boxes)
            .select_related("user", "box")
            .order_by("-date", "-start_time")[:5]
        )
        recent_bookings_data = [
            {
                "id": b.id,
                "user_name": getattr(b.user, "name", getattr(b.user, "email", "N/A")),
                "box_name": getattr(b.box, "name", "N/A"),
                "date": b.date,
                "amount": b.total_amount,
                "status": b.booking_status,
                "time_slot": f"{b.start_time if isinstance(b.start_time, str) else b.start_time.strftime('%H:%M')} - {b.end_time if isinstance(b.end_time, str) else b.end_time.strftime('%H:%M')}"
            }
            for b in recent_bookings_qs
        ]

        # Pass raw queryset to serializer, let it handle serialization
        data = {
            "total_revenue": stats["total_revenue"],
            "total_bookings": stats["total_bookings"],
            "active_boxes_count": approved_boxes.count(),
            "pending_boxes_count": pending_boxes.count(),
            "rejected_boxes_count": rejected_boxes.count(),
            "avg_rating": round(stats["avg_rating"], 1),
            "sports_distribution": dict(sports_count),
            "revenue_chart_labels": revenue_chart_labels,
            "revenue_chart_data": revenue_chart_data,
            "bookings_chart_labels": bookings_chart_labels,
            "bookings_chart_data": bookings_chart_data,
            "recent_bookings": recent_bookings_data,  # Use the formatted data instead of queryset
            "all_owner_boxes": all_owner_boxes,
        }

        serializer = OwnerDashboardStatsSerializer(instance=data)
        return Response(serializer.data)


class OwnerEarningsView(APIView):
    """Per-box earnings over a selectable reporting window — "what did my
    cricket box actually make last month, after commission". Every figure it
    returns is period-scoped and carries its own label, so no amount shown to
    an owner is ambiguous about the span it covers.

    Deliberately windows on Booking.date (when the slot was played), not
    created_at — that's what an owner means by "September's earnings", and it
    matches the Overview revenue chart. The payout ledger still reconciles on
    created_at (see compute_owner_earnings' docstring); all_time totals are
    identical either way, which is what the payout tab compares against."""
    permission_classes = [IsAdminOrOwner]

    def get(self, request, *args, **kwargs):
        # An admin hitting this without ?owner= sees their own (empty) books
        # rather than every owner's mixed together, which would be meaningless.
        owner = request.user
        if request.user.role == 'admin' and request.query_params.get('owner'):
            owner = get_object_or_404(User, pk=request.query_params['owner'], role='owner')

        today = timezone.localdate()
        date_from, date_to, label, key = resolve_period(request.query_params.get('period'), today)
        earnings = compute_owner_earnings(owner, date_from=date_from, date_to=date_to)

        # Month-by-month trend across the selected window, so the owner can
        # see the shape of it rather than just one lump sum. Capped at 12
        # months for all_time so a long-lived account doesn't return a
        # hundred rows.
        trend_start = date_from or _add_months(today.replace(day=1), -11)
        monthly = []
        cursor = trend_start.replace(day=1)
        end_month = (date_to or today).replace(day=1)
        while cursor <= end_month:
            next_month = _add_months(cursor, 1)
            month_totals = compute_owner_earnings(
                owner, date_from=cursor, date_to=next_month - timedelta(days=1),
            )
            monthly.append({
                'month': cursor.strftime('%Y-%m'),
                'label': cursor.strftime('%b %Y'),
                'gross': round(float(month_totals['gross_revenue']), 2),
                'commission': round(float(month_totals['commission']), 2),
                'net': round(float(month_totals['net_revenue']), 2),
                'bookings': month_totals['bookings_count'],
            })
            cursor = next_month

        return Response({
            'period': key,
            'period_label': label,
            'date_from': date_from.isoformat() if date_from else None,
            'date_to': (date_to or today).isoformat(),
            'periods': [{'value': k, 'label': v} for k, v in EARNINGS_PERIODS.items()],
            'gross_revenue': round(float(earnings['gross_revenue']), 2),
            'commission': round(float(earnings['commission']), 2),
            'net_revenue': round(float(earnings['net_revenue']), 2),
            'bookings_count': earnings['bookings_count'],
            'by_box': [
                {
                    'box_id': r['box_id'], 'box_name': r['box_name'], 'sport': r['sport'],
                    'rate': round(float(r['rate']) * 100, 2),
                    'gross': round(float(r['gross']), 2),
                    'commission': round(float(r['commission']), 2),
                    'net': round(float(r['net']), 2),
                    'bookings': r['bookings'],
                }
                for r in earnings['by_box']
            ],
            'monthly': monthly,
        })


class OwnerAnalyticsView(APIView):
    """Deeper analytics beyond the Overview tab's headline stats/charts:
    occupancy, per-box revenue ranking, peak booking hours, cancellation
    rate, repeat-customer rate. Mirrors OwnerDashboardAPIView's admin-sees-
    all / owner-sees-own split."""
    permission_classes = [IsAdminOrOwner]

    ACTIVE_STATUSES = ["Confirmed", "Completed"]
    OCCUPANCY_WINDOW_DAYS = 30

    def _daily_open_hours(self, box):
        """Parse a box's "HH:MM" opening/closing strings into a daily open-
        hours float. Falls back to the same 06:00-23:00 default the booking
        validation and BoxDetails slot generation already assume."""
        try:
            oh, om = map(int, (box.opening_time or "06:00").split(":"))
            ch, cm = map(int, (box.closing_time or "23:00").split(":"))
            return max(0.0, (ch + cm / 60) - (oh + om / 60))
        except (ValueError, AttributeError):
            return 17.0

    def get(self, request, *args, **kwargs):
        user = request.user
        if user.role == "admin":
            owner_boxes = Box.objects.filter(status="approved")
        else:
            owner_boxes = Box.objects.filter(owner=user, status="approved")
        box_ids = list(owner_boxes.values_list("id", flat=True))

        window_start = timezone.now().date() - timedelta(days=self.OCCUPANCY_WINDOW_DAYS)
        booked_hours_by_box = {
            row["box"]: row["hours"]
            for row in Booking.objects.filter(
                box_id__in=box_ids, booking_status__in=self.ACTIVE_STATUSES, date__gte=window_start,
            ).values("box").annotate(hours=Sum("duration"))
        }

        occupancy_by_box = []
        total_booked = 0.0
        total_available = 0.0
        for box in owner_boxes:
            booked = float(booked_hours_by_box.get(box.id, 0) or 0)
            available = self._daily_open_hours(box) * self.OCCUPANCY_WINDOW_DAYS
            pct = round((booked / available) * 100, 1) if available else 0.0
            occupancy_by_box.append({"box": box.name, "occupancy_pct": pct})
            total_booked += booked
            total_available += available
        occupancy_overall_pct = round((total_booked / total_available) * 100, 1) if total_available else 0.0

        per_box_ranking = [
            {"name": b.name, "revenue": float(b.revenue), "bookings": b.booking_count}
            for b in owner_boxes.annotate(
                revenue=Coalesce(
                    Sum("bookings__total_amount", filter=Q(bookings__booking_status__in=self.ACTIVE_STATUSES)),
                    0.0, output_field=DecimalField(),
                ),
                booking_count=Coalesce(
                    Count("bookings", filter=Q(bookings__booking_status__in=self.ACTIVE_STATUSES)), 0,
                ),
            ).order_by("-revenue")
        ]

        # Peak hours — grouped by distinct start_time (start_time is a raw
        # "HH:MM" string, not a TimeField the DB can bucket by hour directly)
        hours_tally = {}
        for row in Booking.objects.filter(
            box_id__in=box_ids, booking_status__in=self.ACTIVE_STATUSES
        ).values("start_time").annotate(count=Count("id")):
            hour = (row["start_time"] or "")[:2]
            if hour:
                hours_tally[hour] = hours_tally.get(hour, 0) + row["count"]
        total_hour_bookings = sum(hours_tally.values()) or 1
        peak_hours_sorted = sorted(hours_tally.items(), key=lambda kv: kv[0])
        peak_hours = {
            "labels": [f"{h}:00" for h, _ in peak_hours_sorted],
            "data": [round((c / total_hour_bookings) * 100, 1) for _, c in peak_hours_sorted],
        }

        all_bookings_count = Booking.objects.filter(box_id__in=box_ids).count()
        cancelled_count = Booking.objects.filter(box_id__in=box_ids, booking_status="Cancelled").count()
        cancellation_rate_pct = round((cancelled_count / all_bookings_count) * 100, 1) if all_bookings_count else 0.0

        customer_rows = list(
            Booking.objects.filter(box_id__in=box_ids, booking_status__in=self.ACTIVE_STATUSES)
            .values("user").annotate(cnt=Count("id"))
        )
        total_customers = len(customer_rows)
        repeat_customers = sum(1 for row in customer_rows if row["cnt"] > 1)
        repeat_customer_rate_pct = round((repeat_customers / total_customers) * 100, 1) if total_customers else 0.0

        return Response({
            "occupancy_overall_pct": occupancy_overall_pct,
            "occupancy_by_box": occupancy_by_box,
            "per_box_ranking": per_box_ranking,
            "peak_hours": peak_hours,
            "cancellation_rate_pct": cancellation_rate_pct,
            "repeat_customer_rate_pct": repeat_customer_rate_pct,
        })


class OwnerBookingViewSet(viewsets.ReadOnlyModelViewSet):
    """Bookings-on-my-boxes list for the owner Bookings tab, replacing the
    Overview payload's hard-capped top-5 recent_bookings slice. Owner-only
    (not IsAdminOrOwner) — admin already has its own dedicated bookings
    endpoint (AdminBookingViewSet in bookings/views.py), so this stays a
    clean owner-scoped surface rather than a dual-purpose one."""
    serializer_class = OwnerBookingSerializer
    permission_classes = [IsOwnerUser]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = OwnerBookingFilter
    search_fields = ["user__email", "user__first_name", "user__last_name", "box__name"]
    ordering_fields = ["date", "created_at", "total_amount"]
    ordering = ["-date", "-start_time"]

    def get_queryset(self):
        return Booking.objects.filter(box__owner=self.request.user).select_related("user", "box")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()  # already scoped to the owner's own boxes via get_queryset()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "A cancellation reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cancel_booking(booking, cancelled_by=request.user, reason=reason)
        except CancellationError as e:
            return Response({"detail": e.detail}, status=e.status_code)
        return Response(self.get_serializer(booking).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        """Bookings as CSV for the owner's own accounting. Runs the same
        filter_queryset() the list endpoint does, so whatever date range /
        box / status filters the owner has applied in the UI carry over
        verbatim — but deliberately skips pagination, since a partial export
        would be worse than useless for bookkeeping."""
        rows = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="bookings-{timezone.now().date()}.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "Booking ID", "Box", "Date", "Start", "End", "Duration (hrs)", "Customer", "Customer email",
            "Customer phone", "Source", "Status", "Payment status", "Amount", "Booked on",
        ])
        for b in rows.iterator():
            is_manual = b.booking_source == "owner_manual"
            writer.writerow([
                b.id, b.box.name, b.date, b.start_time, b.end_time, b.duration,
                (b.customer_name or "Walk-in customer") if is_manual else (b.user.full_name or b.user.email),
                "" if is_manual else b.user.email,
                b.customer_phone if is_manual else "",
                b.get_booking_source_display(), b.booking_status, b.payment_status,
                b.total_amount, b.created_at.strftime("%Y-%m-%d %H:%M"),
            ])
        return response

    @action(detail=False, methods=["post"], url_path="bulk-cancel")
    def bulk_cancel(self, request):
        """Cancel several bookings in one action — e.g. a box going offline
        for a day. Deliberately best-effort per booking rather than
        all-or-nothing: an owner clearing a day shouldn't have the whole
        batch rejected because one booking is inside its cancellation
        window, so each is attempted independently and the response reports
        exactly which ones failed and why."""
        ids = request.data.get("booking_ids")
        reason = (request.data.get("reason") or "").strip()
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "booking_ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({"detail": "A cancellation reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > MAX_BULK_CANCEL:
            return Response(
                {"detail": f"Please cancel at most {MAX_BULK_CANCEL} bookings at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # get_queryset() already scopes to this owner's boxes, so unknown or
        # someone else's ids simply don't come back.
        bookings = list(self.get_queryset().filter(pk__in=ids, booking_status="Confirmed"))
        cancelled, failed = [], []
        for booking in bookings:
            try:
                cancel_booking(booking, cancelled_by=request.user, reason=reason)
                cancelled.append(booking.id)
            except CancellationError as e:
                failed.append({"id": booking.id, "detail": e.detail})

        skipped = [i for i in ids if i not in cancelled and not any(f["id"] == i for f in failed)]
        return Response({
            "cancelled_count": len(cancelled),
            "cancelled_ids": cancelled,
            "failed": failed,
            "skipped_ids": skipped,
            "detail": (
                f"{len(cancelled)} booking{'s' if len(cancelled) != 1 else ''} cancelled and refunded."
                + (f" {len(failed)} could not be cancelled." if failed else "")
                + (f" {len(skipped)} were already cancelled or not found." if skipped else "")
            ),
        })

    @action(detail=False, methods=["post"])
    def book(self, request):
        """Owner-priority manual booking: lets an owner claim a slot on
        their own box directly (walk-in customer, maintenance block, etc.).
        Preempts any customer currently holding or queued for that exact
        slot (see reservation.preempt_slot) — but never overrides a slot
        that's already Confirmed/Completed, since that's a real customer's
        paid-for booking, not a contested hold."""
        parsed = validate_booking_request(request.data)

        try:
            box = Box.objects.get(pk=parsed["box_id"])
        except Box.DoesNotExist:
            return Response({"detail": "Box not found."}, status=status.HTTP_400_BAD_REQUEST)
        if box.owner_id != request.user.id:
            return Response(
                {"detail": "You can only book slots on your own facilities."},
                status=status.HTTP_403_FORBIDDEN,
            )

        already_booked = Booking.objects.filter(
            box_id=parsed["box_id"],
            date=parsed["booking_date"],
            start_time=parsed["start_time_str"],
            booking_status__in=["Confirmed", "Completed"],
        ).exists()
        if already_booked:
            return Response(
                {"detail": "This time slot is already booked and confirmed."},
                status=status.HTTP_409_CONFLICT,
            )

        date_str = parsed["booking_date"].isoformat()
        preempt = reservation.preempt_slot(
            parsed["box_id"], date_str, parsed["start_time_str"], parsed["duration_hours"],
        )
        displaced_user_ids = list(preempt.queued_user_ids)
        if preempt.had_holder:
            displaced_user_ids.append(preempt.holder_user_id)
        if displaced_user_ids:
            sig = reservation.slot_signature(
                parsed["box_id"], date_str, parsed["start_time_str"], parsed["duration_hours"],
            )
            broadcasting.broadcast_owner_reserved(sig, request.user.id)
            # Also persist a notification for each displaced customer, in
            # case they aren't actively watching the page when the socket
            # broadcast fires (the live toast in Checkout.jsx is best-effort).
            for displaced_user in User.objects.filter(id__in=displaced_user_ids):
                notify(
                    displaced_user,
                    'Slot reserved by the venue',
                    f"Your held slot for {box.name} on {date_str} at {parsed['start_time_str']} was reserved "
                    "by the turf owner. Please select another slot.",
                )

        payment_status = request.data.get("paymentStatus")
        if payment_status not in ("Not Required", "Completed"):
            payment_status = "Not Required"

        try:
            booking = create_booking_row(
                user=request.user,
                box_id=parsed["box_id"],
                booking_date=parsed["booking_date"],
                start_time_str=parsed["start_time_str"],
                duration_hours=parsed["duration_hours"],
                end_time_str=parsed["end_time_str"],
                booking_source="owner_manual",
                created_by=request.user,
                customer_name=(request.data.get("customerName") or "").strip(),
                customer_phone=(request.data.get("customerPhone") or "").strip(),
                payment_status=payment_status,
            )
        except BookingWriteError as e:
            return Response({"detail": e.detail}, status=e.status_code)

        return Response(self.get_serializer(booking).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-no-show")
    def mark_no_show(self, request, pk=None):
        """Owner marks a customer who never turned up. Deliberately distinct
        from `cancel` above: no refund (see bookings/services.py's
        cancel_booking -> _refund_booking, never called here), and no
        reward-granting (never calls rewards.services.on_booking_completed —
        the customer didn't show, they don't earn cashback/scratch/spin for
        it). Only legal on a Confirmed booking whose start time has already
        passed — can't pre-emptively no-show a future booking. Once marked,
        the hourly mark_completed_bookings_task naturally skips this row
        going forward since it only ever touches booking_status='Confirmed'
        rows."""
        booking = self.get_object()  # already scoped to the owner's own boxes via get_queryset()

        if booking.booking_status != "Confirmed":
            return Response(
                {"detail": "Only confirmed bookings can be marked as a no-show."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking_dt = datetime.combine(booking.date, time.fromisoformat(booking.start_time))
        if settings.USE_TZ:
            booking_dt = timezone.make_aware(booking_dt)
        if timezone.now() < booking_dt:
            return Response(
                {"detail": "This booking hasn't started yet — you can only mark a no-show once its start time has passed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking.booking_status = "No-show"
        booking.save(update_fields=["booking_status"])

        notify(
            booking.user,
            "Marked as a no-show",
            f"Your booking for {booking.box.name} on {booking.date} at {booking.start_time} was marked as a "
            "no-show since it wasn't used. No refund applies for a missed booking.",
        )

        return Response(self.get_serializer(booking).data)


class PayoutViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Manual payout ledger: admin records payouts made to owners outside
    the app (bank transfer, cash, etc.); owners see their own balance and
    history. Not a real payment integration — see Payout's docstring."""
    serializer_class = PayoutSerializer
    permission_classes = [IsAdminOrOwner]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        if self.request.user.role == "admin":
            return Payout.objects.select_related("owner").all()
        return Payout.objects.filter(owner=self.request.user)

    @action(detail=False, methods=["get"])
    def export(self, request):
        """Payout history as CSV — an owner exports their own, an admin
        exports every recorded payout (get_queryset() already draws that
        line)."""
        rows = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="payouts-{timezone.now().date()}.csv"'
        writer = csv.writer(response)
        writer.writerow(["Payout ID", "Owner", "Amount", "Payment method", "Transaction ID", "Note", "Recorded on"])
        for p in rows.iterator():
            writer.writerow([
                p.id, p.owner.email, p.amount,
                p.get_payment_method_display() if p.payment_method else "",
                p.transaction_id, p.note, p.created_at.strftime("%Y-%m-%d %H:%M"),
            ])
        return response

    def perform_create(self, serializer):
        if self.request.user.role != "admin":
            raise PermissionDenied("Only admins can record a payout.")
        payout = serializer.save(created_by=self.request.user)
        notify(
            payout.owner, "Payout recorded",
            f"A payout of ₹{payout.amount} was recorded for your account."
            + (f" Note: {payout.note}" if payout.note else ""),
        )
        log_admin_action(
            self.request.user, 'payout.record', target=payout,
            details={
                'owner': payout.owner.email, 'amount': str(payout.amount),
                'payment_method': payout.payment_method, 'note': payout.note,
            },
        )

    def _balance_for_owner(self, owner):
        earnings = compute_owner_earnings(owner)
        net = float(earnings["net_revenue"])
        paid = Payout.objects.filter(owner=owner).aggregate(
            total=Coalesce(Sum("amount"), 0.0, output_field=DecimalField())
        )["total"]
        # Surfaced so the admin Record Payout UI can show where the money
        # should actually go, right where it's about to be recorded (see
        # OwnerPayoutDetails' docstring). Read-only here — a plain lookup,
        # not get_or_create, so simply loading the balance list never
        # creates rows for owners who haven't touched the feature.
        try:
            payout_details = OwnerPayoutDetailsSerializer(owner.payout_details).data
        except OwnerPayoutDetails.DoesNotExist:
            payout_details = None
        return {
            "owner_id": owner.id,
            "owner_email": owner.email,
            "owner_name": owner.full_name or owner.email,
            "gross_revenue": round(float(earnings["gross_revenue"]), 2),
            "commission": round(float(earnings["commission"]), 2),
            "net_revenue": round(net, 2),
            "total_paid": round(float(paid), 2),
            "balance_due": round(net - float(paid), 2),
            "payout_details": payout_details,
            "by_sport": [
                {
                    "sport": row["sport"],
                    "rate": round(float(row["rate"]) * 100, 2),
                    "gross": round(float(row["gross"]), 2),
                    "commission": round(float(row["commission"]), 2),
                    "net": round(float(row["net"]), 2),
                }
                for row in earnings["by_sport"]
            ],
            # Per-box so an owner can check the payout they're owed against
            # each individual venue's contribution, rather than having to
            # take one combined number on trust.
            "by_box": [
                {
                    "box_id": row["box_id"],
                    "box_name": row["box_name"],
                    "sport": row["sport"],
                    "rate": round(float(row["rate"]) * 100, 2),
                    "gross": round(float(row["gross"]), 2),
                    "commission": round(float(row["commission"]), 2),
                    "net": round(float(row["net"]), 2),
                    "bookings": row["bookings"],
                }
                for row in earnings["by_box"]
            ],
        }

    @action(detail=False, methods=["get"])
    def balance(self, request):
        """Admin: every owner's balance, highest-owed first — paginated,
        since this is a custom @action (no automatic pagination like a
        ModelViewSet.list()) and was returning the entire platform's owners
        unbounded. Owner: just their own, a single object, never paginated —
        same response shape either way so the frontend doesn't need to
        branch on role."""
        if request.user.role == "admin":
            owners = User.objects.filter(role="owner")
            data = sorted((self._balance_for_owner(o) for o in owners), key=lambda d: d["balance_due"], reverse=True)
            paginator = StandardResultsPagination()
            page = paginator.paginate_queryset(data, request, view=self)
            return paginator.get_paginated_response(page)
        return Response(self._balance_for_owner(request.user))

class PayoutScheduleViewSet(viewsets.ModelViewSet):
    """Admin sets/edits an owner's payout cadence; the owner can read their
    own schedule (used for the "Next payout: ..." readout) but can't write
    it — write access to money-timing config stays admin-only."""
    serializer_class = PayoutScheduleSerializer
    permission_classes = [IsAdminOrOwner]

    def get_queryset(self):
        if self.request.user.role == "admin":
            return PayoutSchedule.objects.select_related("owner").all()
        return PayoutSchedule.objects.filter(owner=self.request.user)

    def check_write_permission(self):
        if self.request.user.role != "admin":
            raise PermissionDenied("Only admins can set a payout schedule.")

    def perform_create(self, serializer):
        self.check_write_permission()
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self.check_write_permission()
        serializer.save()

    def perform_destroy(self, instance):
        self.check_write_permission()
        instance.delete()
