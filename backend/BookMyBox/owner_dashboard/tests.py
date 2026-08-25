from datetime import date, datetime, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box, CommissionRate
from bookings.models import Booking
from user.models import AdminActionLog, OwnerPayoutDetails
from .models import Payout, PayoutSchedule
from .serializers import PayoutSerializer
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

    def test_is_due_today_weekly_not_due_before_target_weekday(self):
        # Target is Thursday — Wednesday of the same week hasn't reached it
        # yet (Monday is an awkward choice for this case: as weekday 0, the
        # "day before" always belongs to the *previous* week's already-past
        # cycle, i.e. legitimately due-for-catch-up rather than not-yet-due —
        # see test_is_due_today_weekly_catches_up_a_missed_run below).
        schedule = PayoutSchedule(frequency='weekly', day_of_week=3, active=True)
        self.assertFalse(is_due_today(schedule, date(2026, 8, 19)))  # Wednesday
        self.assertTrue(is_due_today(schedule, date(2026, 8, 20)))  # Thursday

    def test_is_due_today_weekly_catches_up_a_missed_run(self):
        # The scheduled Monday run was missed (e.g. Celery Beat downtime) —
        # it should still fire the next time the task runs, not silently
        # wait a full week for the next Monday.
        schedule = PayoutSchedule(frequency='weekly', day_of_week=0, active=True)  # never run
        self.assertTrue(is_due_today(schedule, date(2026, 8, 18)))  # Tuesday

    def test_is_due_today_weekly_not_due_again_after_already_running_this_week(self):
        schedule = PayoutSchedule(
            frequency='weekly', day_of_week=0, active=True,
            last_run_at=timezone.make_aware(datetime.combine(date(2026, 8, 17), time(9, 0))),
        )
        self.assertFalse(is_due_today(schedule, date(2026, 8, 18)))  # already ran this Monday

    def test_is_due_today_monthly(self):
        schedule = PayoutSchedule(frequency='monthly', day_of_month=15, active=True)
        self.assertTrue(is_due_today(schedule, date(2026, 8, 15)))
        self.assertFalse(is_due_today(schedule, date(2026, 8, 14)))  # before the target day

    def test_is_due_today_monthly_catches_up_a_missed_run(self):
        schedule = PayoutSchedule(frequency='monthly', day_of_month=15, active=True)  # never run
        self.assertTrue(is_due_today(schedule, date(2026, 8, 20)))  # past the 15th, never ran

    def test_is_due_today_monthly_not_due_again_after_already_running_this_month(self):
        schedule = PayoutSchedule(
            frequency='monthly', day_of_month=15, active=True,
            last_run_at=timezone.make_aware(datetime.combine(date(2026, 8, 15), time(9, 0))),
        )
        self.assertFalse(is_due_today(schedule, date(2026, 8, 20)))

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


class PayoutPaymentMethodFieldsTests(APITestCase):
    """payment_method/transaction_id — new optional fields on Payout (see
    Payout.PAYMENT_METHOD_CHOICES). Confirms they serialize/deserialize
    correctly and that omitting them entirely (the old-style call shape)
    still works, so existing integrations (e.g. run_scheduled_payouts_task)
    don't break."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='payout_owner@example.com', username='payout_owner@example.com',
            password='testpass123', role='owner',
        )
        self.admin = User.objects.create_user(
            email='payout_admin@example.com', username='payout_admin@example.com',
            password='testpass123', role='admin',
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_payout_serializes_new_fields(self):
        payout = Payout.objects.create(
            owner=self.owner, amount=Decimal('500.00'),
            payment_method='upi', transaction_id='UTR123456',
        )
        data = PayoutSerializer(payout).data
        self.assertEqual(data['payment_method'], 'upi')
        self.assertEqual(data['transaction_id'], 'UTR123456')

    def test_admin_can_record_payout_with_payment_method_and_transaction_id(self):
        self._auth(self.admin)
        response = self.client.post('/api/owner_dashboard/payouts/', {
            'owner': self.owner.id, 'amount': '250.00',
            'payment_method': 'bank_transfer', 'transaction_id': 'REF-9001',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        payout = Payout.objects.get(owner=self.owner)
        self.assertEqual(payout.payment_method, 'bank_transfer')
        self.assertEqual(payout.transaction_id, 'REF-9001')

    def test_perform_create_still_works_when_new_fields_omitted(self):
        """Backward compatibility: old-style payout-recording calls (no
        payment_method/transaction_id in the payload) must not break, since
        both fields are blank=True, default=''."""
        self._auth(self.admin)
        response = self.client.post('/api/owner_dashboard/payouts/', {
            'owner': self.owner.id, 'amount': '100.00',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        payout = Payout.objects.get(owner=self.owner)
        self.assertEqual(payout.payment_method, '')
        self.assertEqual(payout.transaction_id, '')


class PayoutAuditLogTests(APITestCase):
    """AdminActionLog row for PayoutViewSet.perform_create — see
    owner_dashboard/views.py and user/audit.py::log_admin_action()."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='payout_audit_owner@example.com', username='payout_audit_owner@example.com',
            password='testpass123', role='owner',
        )
        self.admin = User.objects.create_user(
            email='payout_audit_admin@example.com', username='payout_audit_admin@example.com',
            password='testpass123', role='admin',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.admin).access_token}'
        )

    def test_recording_a_payout_writes_audit_log_row(self):
        response = self.client.post('/api/owner_dashboard/payouts/', {
            'owner': self.owner.id, 'amount': '750.00', 'note': 'August settlement',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payout = Payout.objects.get(owner=self.owner)

        log = AdminActionLog.objects.filter(action='payout.record', target_id=str(payout.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.target_type, 'Payout')
        self.assertEqual(log.details['owner'], self.owner.email)
        self.assertEqual(log.details['amount'], '750.00')


class PayoutBalancePayoutDetailsTests(APITestCase):
    """payout_details embedded in PayoutViewSet.balance's per-owner rows —
    see owner_dashboard/views.py's _balance_for_owner. This is how the
    admin Record Payout modal (AdminDashboard.jsx) learns where an owner's
    money should go before recording a payout. Read-only from this side —
    only the owner can edit their own (see user.tests.OwnerPayoutDetailsTests)."""

    def setUp(self):
        self.owner_with_details = User.objects.create_user(
            email='balance_owner_with_details@example.com', username='balance_owner_with_details@example.com',
            password='testpass123', role='owner',
        )
        OwnerPayoutDetails.objects.create(
            owner=self.owner_with_details, upi_id='details-owner@upi', account_holder_name='Details Owner',
        )
        self.owner_without_details = User.objects.create_user(
            email='balance_owner_without_details@example.com', username='balance_owner_without_details@example.com',
            password='testpass123', role='owner',
        )
        self.admin = User.objects.create_user(
            email='balance_admin@example.com', username='balance_admin@example.com',
            password='testpass123', role='admin',
        )

    def _auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')

    def test_admin_balance_list_surfaces_payout_details_per_owner(self):
        self._auth(self.admin)
        response = self.client.get('/api/owner_dashboard/payouts/balance/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)  # paginated, unlike the single-owner dict shape below
        rows = {row['owner_id']: row for row in response.data['results']}

        with_details = rows[self.owner_with_details.id]
        self.assertIsNotNone(with_details['payout_details'])
        self.assertEqual(with_details['payout_details']['upi_id'], 'details-owner@upi')

        without_details = rows[self.owner_without_details.id]
        self.assertIsNone(without_details['payout_details'])

    def test_viewing_admin_balance_does_not_lazily_create_a_row(self):
        """Unlike the owner's own GET (which lazily creates), the admin
        balance view is read-only and must never create rows just because
        an admin looked at the list."""
        self._auth(self.admin)
        self.client.get('/api/owner_dashboard/payouts/balance/')
        self.assertFalse(OwnerPayoutDetails.objects.filter(owner=self.owner_without_details).exists())

    def test_non_admin_cannot_reach_balance_for_other_owners(self):
        self._auth(self.owner_without_details)
        response = self.client.get('/api/owner_dashboard/payouts/balance/')
        self.assertEqual(response.status_code, 200)
        # Owner-role callers get only their own row (a dict, not a list) —
        # never another owner's payout_details.
        self.assertIsInstance(response.data, dict)
        self.assertEqual(response.data['owner_id'], self.owner_without_details.id)
        self.assertIsNone(response.data['payout_details'])
