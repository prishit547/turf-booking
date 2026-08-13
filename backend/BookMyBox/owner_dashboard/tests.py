from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box, CommissionRate
from bookings.models import Booking
from .models import Payout, PayoutSchedule
from .services import compute_owner_earnings
from .tasks import is_due_today, run_scheduled_payouts_task

User = get_user_model()

URL = '/api/owner_dashboard/stats/'


class OwnerDashboardStatsTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='1234567891', location='Mumbai', business_name='Elite Sports',
        )
        self.other_owner = User.objects.create_user(
            email='other_owner@example.com', username='other_owner@example.com', password='testpass123',
            role='owner', phone='1234567892', location='Mumbai', business_name='Other Sports',
        )
        self.plain_user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        self.admin = User.objects.create_user(
            email='admin@example.com', username='admin@example.com', password='testpass123',
            role='admin', phone='1234567893', location='Mumbai',
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_unauthenticated_rejected(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 401)

    def test_plain_user_forbidden(self):
        self._auth(self.plain_user)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 403)

    def test_owner_with_no_boxes_gets_zeroed_stats(self):
        self._auth(self.owner)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_revenue'], '0.00')
        self.assertEqual(response.data['total_bookings'], 0)
        self.assertEqual(response.data['active_boxes_count'], 0)
        self.assertEqual(response.data['all_owner_boxes'], [])

    def test_owner_sees_only_own_boxes_and_correct_revenue(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Box.objects.create(
            name='Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=300, capacity=10, owner=self.other_owner, status='approved',
        )
        Booking.objects.create(
            user=self.plain_user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )

        self._auth(self.owner)
        response = self.client.get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_revenue'], '1000.00')
        self.assertEqual(response.data['total_bookings'], 1)
        self.assertEqual(response.data['active_boxes_count'], 1)
        self.assertEqual(len(response.data['all_owner_boxes']), 1)
        self.assertEqual(response.data['all_owner_boxes'][0]['name'], 'Elite Cricket Box')

    def test_pending_and_rejected_counts(self):
        Box.objects.create(
            name='Pending Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='pending',
        )
        Box.objects.create(
            name='Rejected Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='rejected',
        )

        self._auth(self.owner)
        response = self.client.get(URL)

        self.assertEqual(response.data['pending_boxes_count'], 1)
        self.assertEqual(response.data['rejected_boxes_count'], 1)
        self.assertEqual(response.data['active_boxes_count'], 0)

    def test_admin_sees_all_owners_boxes(self):
        Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Box.objects.create(
            name='Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=300, capacity=10, owner=self.other_owner, status='approved',
        )

        self._auth(self.admin)
        response = self.client.get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_boxes_count'], 2)

    def test_cancelled_bookings_excluded_from_revenue(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.plain_user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Cancelled',
        )

        self._auth(self.owner)
        response = self.client.get(URL)

        self.assertEqual(response.data['total_revenue'], '0.00')
        self.assertEqual(response.data['total_bookings'], 0)

    def test_recent_bookings_shape(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.plain_user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )

        self._auth(self.owner)
        response = self.client.get(URL)

        self.assertEqual(len(response.data['recent_bookings']), 1)
        recent = response.data['recent_bookings'][0]
        self.assertEqual(recent['box_name'], 'Elite Cricket Box')
        self.assertEqual(recent['time_slot'], '10:00 - 12:00')
        self.assertEqual(recent['status'], 'Confirmed')


class ComputeOwnerEarningsTests(APITestCase):
    """compute_owner_earnings() — shared by PayoutViewSet.balance() and the
    scheduled-payout task, resolving commission per booking now that rates
    can vary by owner and sport (see boxes/pricing.py::resolve_commission_rate)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='earnings_owner@example.com', username='earnings_owner@example.com',
            password='testpass123', role='owner',
        )
        self.cricket_box = Box.objects.create(
            name='Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.football_box = Box.objects.create(
            name='Football Box', sport='Football', sports=['Football'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.player = User.objects.create_user(
            email='earnings_player@example.com', username='earnings_player@example.com',
            password='testpass123', role='user',
        )

    def test_mixed_sports_with_per_sport_override(self):
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('20.00'), effective_from='2026-01-01')
        # Football has no override — falls back to the platform default.
        Booking.objects.create(
            user=self.player, box=self.cricket_box, date='2026-08-01', start_time='10:00', end_time='11:00',
            duration=1, total_amount=1000, booking_status='Confirmed',
        )
        Booking.objects.create(
            user=self.player, box=self.football_box, date='2026-08-01', start_time='10:00', end_time='11:00',
            duration=1, total_amount=1000, booking_status='Confirmed',
        )

        from django.conf import settings
        default_rate = Decimal(str(settings.DEFAULT_COMMISSION_RATE))

        result = compute_owner_earnings(self.owner)
        self.assertEqual(result['gross_revenue'], Decimal('2000'))
        expected_commission = Decimal('1000') * Decimal('0.20') + Decimal('1000') * default_rate
        self.assertEqual(result['commission'], expected_commission)

        by_sport = {row['sport']: row for row in result['by_sport']}
        self.assertEqual(by_sport['Cricket']['commission'], Decimal('200.00'))
        self.assertEqual(by_sport['Football']['commission'], Decimal('1000') * default_rate)

    def test_cancelled_bookings_excluded(self):
        Booking.objects.create(
            user=self.player, box=self.cricket_box, date='2026-08-01', start_time='10:00', end_time='11:00',
            duration=1, total_amount=1000, booking_status='Cancelled',
        )
        result = compute_owner_earnings(self.owner)
        self.assertEqual(result['gross_revenue'], Decimal('0'))


class ScheduledPayoutsTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='schedule_owner@example.com', username='schedule_owner@example.com',
            password='testpass123', role='owner',
        )
        self.box = Box.objects.create(
            name='Schedule Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.player = User.objects.create_user(
            email='schedule_player@example.com', username='schedule_player@example.com',
            password='testpass123', role='user',
        )

    def test_is_due_today_weekly(self):
        today = date(2026, 8, 17)  # a Monday
        schedule = PayoutSchedule(frequency='weekly', day_of_week=0, active=True)
        self.assertTrue(is_due_today(schedule, today))
        self.assertFalse(is_due_today(schedule, date(2026, 8, 18)))  # Tuesday

    def test_is_due_today_monthly(self):
        schedule = PayoutSchedule(frequency='monthly', day_of_month=15, active=True)
        self.assertTrue(is_due_today(schedule, date(2026, 8, 15)))
        self.assertFalse(is_due_today(schedule, date(2026, 8, 16)))

    def test_is_due_today_inactive_schedule_never_due(self):
        schedule = PayoutSchedule(frequency='monthly', day_of_month=15, active=False)
        self.assertFalse(is_due_today(schedule, date(2026, 8, 15)))

    def test_run_scheduled_payouts_creates_one_payout_per_due_owner(self):
        today = timezone.localdate()
        PayoutSchedule.objects.create(
            owner=self.owner, frequency='monthly', day_of_month=today.day, active=True,
        )
        Booking.objects.create(
            user=self.player, box=self.box, date='2026-08-01', start_time='10:00', end_time='11:00',
            duration=1, total_amount=1000, booking_status='Confirmed',
        )

        processed = run_scheduled_payouts_task()
        self.assertEqual(processed, 1)
        self.assertEqual(Payout.objects.filter(owner=self.owner, source='scheduled').count(), 1)

        schedule = PayoutSchedule.objects.get(owner=self.owner)
        self.assertIsNotNone(schedule.last_run_at)

    def test_second_same_day_run_is_a_noop(self):
        today = timezone.localdate()
        PayoutSchedule.objects.create(
            owner=self.owner, frequency='monthly', day_of_month=today.day, active=True,
        )
        Booking.objects.create(
            user=self.player, box=self.box, date='2026-08-01', start_time='10:00', end_time='11:00',
            duration=1, total_amount=1000, booking_status='Confirmed',
        )

        run_scheduled_payouts_task()
        second_run_processed = run_scheduled_payouts_task()
        self.assertEqual(second_run_processed, 0)
        self.assertEqual(Payout.objects.filter(owner=self.owner, source='scheduled').count(), 1)

    def test_not_due_owner_is_skipped(self):
        today = timezone.localdate()
        not_today = 15 if today.day != 15 else 16
        PayoutSchedule.objects.create(
            owner=self.owner, frequency='monthly', day_of_month=not_today, active=True,
        )
        processed = run_scheduled_payouts_task()
        self.assertEqual(processed, 0)
        self.assertEqual(Payout.objects.filter(owner=self.owner, source='scheduled').count(), 0)
