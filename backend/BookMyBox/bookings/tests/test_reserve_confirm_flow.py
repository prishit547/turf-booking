"""
HTTP-level tests for the two-phase reserve/confirm/release_hold flow.
Uses real Redis (see test_reservation.py's docstring for why) and
TransactionTestCase (not TestCase) for the concurrency test specifically,
since TestCase's wrapping transaction would hide genuine cross-thread
locking behavior that TransactionTestCase's real-commit semantics expose.
"""

from concurrent.futures import ThreadPoolExecutor

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings import reservation
from bookings.models import Booking
from bookings.tasks import expire_hold_task

User = get_user_model()


def _make_client_for(user):
    client = APIClient()
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


class ReserveConfirmFlowTestCase(APITestCase):
    def setUp(self):
        reservation.get_client().flushdb()
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='1234567891', location='Mumbai', business_name='Elite Sports',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )
        self.user_a = User.objects.create_user(
            email='a@example.com', username='a@example.com', password='testpass123',
            role='user', phone='1111111111', location='Mumbai',
        )
        self.user_b = User.objects.create_user(
            email='b@example.com', username='b@example.com', password='testpass123',
            role='user', phone='2222222222', location='Mumbai',
        )
        self.client_a = _make_client_for(self.user_a)
        self.client_b = _make_client_for(self.user_b)

    def tearDown(self):
        reservation.get_client().flushdb()

    def _reserve_payload(self):
        return {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2}


class ReserveTests(ReserveConfirmFlowTestCase):
    def test_first_reserve_is_held(self):
        response = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'held')
        self.assertIn('hold_token', response.data)

    def test_second_reserve_is_queued(self):
        self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json')
        response = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'queued')
        self.assertEqual(response.data['position'], 1)

    def test_reserve_already_booked_slot_returns_409_without_touching_redis(self):
        Booking.objects.create(
            user=self.user_a, box=self.box, date='2030-01-15', start_time='10:00',
            end_time='12:00', duration=2, total_amount=1000, booking_status='Confirmed',
        )
        response = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json')
        self.assertEqual(response.status_code, 409)


class ConfirmTests(ReserveConfirmFlowTestCase):
    def test_holder_can_confirm_and_booking_is_created(self):
        held = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        response = self.client_a.post(f"/api/bookings/confirm/{held['hold_token']}/", format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Booking.objects.count(), 1)

    def test_queued_user_cannot_confirm(self):
        self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json')
        queued = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        response = self.client_b.post(f"/api/bookings/confirm/{queued['hold_token']}/", format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Booking.objects.count(), 0)

    def test_confirm_drains_queue_not_promotes(self):
        held = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        queued = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data

        response = self.client_a.post(f"/api/bookings/confirm/{held['hold_token']}/", format='json')
        self.assertEqual(response.status_code, 201)

        # B's slot is gone now, not promoted into a hold
        status_after = reservation.get_hold_status(queued['hold_token'])
        self.assertFalse(status_after.found)


class ReleaseHoldTests(ReserveConfirmFlowTestCase):
    def test_explicit_release_promotes_next_in_queue(self):
        held = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        queued = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data

        response = self.client_a.post(f"/api/bookings/release_hold/{held['hold_token']}/", format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'promoted')

        promoted_status = reservation.get_hold_status(queued['hold_token'])
        self.assertTrue(promoted_status.found)
        self.assertEqual(promoted_status.status, 'held')

        # B can now confirm using the same hold_token they were originally queued with
        confirm_response = self.client_b.post(f"/api/bookings/confirm/{queued['hold_token']}/", format='json')
        self.assertEqual(confirm_response.status_code, 201)

    def test_non_holder_cannot_release_someone_elses_hold(self):
        held = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        response = self.client_b.post(f"/api/bookings/release_hold/{held['hold_token']}/", format='json')
        self.assertEqual(response.status_code, 403)


class ExpiryTaskTests(ReserveConfirmFlowTestCase):
    def test_expire_hold_task_promotes_next_in_queue(self):
        held = self.client_a.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data
        queued = self.client_b.post('/api/bookings/reserve/', self._reserve_payload(), format='json').data

        # Call the task function directly (a Celery task is just a callable)
        # rather than waiting for its real eta — standard Celery test pattern.
        expire_hold_task(held['hold_token'])

        promoted_status = reservation.get_hold_status(queued['hold_token'])
        self.assertTrue(promoted_status.found)
        self.assertEqual(promoted_status.status, 'held')

        confirm_response = self.client_b.post(f"/api/bookings/confirm/{queued['hold_token']}/", format='json')
        self.assertEqual(confirm_response.status_code, 201)


class ConcurrencyProofTestCase(TransactionTestCase):
    """The full-stack centerpiece: 50 real threads, each doing the complete
    reserve -> confirm sequence over real HTTP against one identical slot
    signature. This committed test *is* the 'hammer one slot with N
    simultaneous requests' load-proof — not a separate throwaway script."""

    def setUp(self):
        reservation.get_client().flushdb()
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='1234567891', location='Mumbai', business_name='Elite Sports',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )
        self.users = [
            User.objects.create_user(
                email=f'user{i}@example.com', username=f'user{i}@example.com', password='testpass123',
                role='user', phone=f'{i:010d}', location='Mumbai',
            )
            for i in range(50)
        ]

    def tearDown(self):
        reservation.get_client().flushdb()

    def test_fifty_concurrent_reserve_and_confirm_exactly_one_booking_wins(self):
        payload = {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2}

        # Issue every user's JWT and APIClient up front, sequentially — by
        # the time real users are racing to click "book" they're already
        # authenticated, so token issuance (which itself writes an
        # OutstandingToken row per call via simplejwt's blacklist app) isn't
        # part of the race this test is proving and shouldn't contend with
        # it for SQLite's single writer lock.
        clients = [_make_client_for(user) for user in self.users]

        def attempt(client):
            reserve_response = client.post('/api/bookings/reserve/', payload, format='json')
            if reserve_response.status_code != 201 or reserve_response.data.get('status') != 'held':
                return {'confirmed': False, 'status_code': reserve_response.status_code}
            hold_token = reserve_response.data['hold_token']
            confirm_response = client.post(f'/api/bookings/confirm/{hold_token}/', format='json')
            return {'confirmed': confirm_response.status_code == 201, 'status_code': confirm_response.status_code}

        with ThreadPoolExecutor(max_workers=50) as pool:
            results = list(pool.map(attempt, clients))

        confirmed = [r for r in results if r['confirmed']]
        self.assertEqual(len(confirmed), 1, f"exactly one confirm should succeed, got: {results}")
        self.assertEqual(Booking.objects.count(), 1, "exactly one Booking row must exist")
        self.assertEqual(Booking.objects.filter(box=self.box, date='2030-01-15', start_time='10:00').count(), 1)

        # no leaked Redis state: nothing should still be sitting in a held
        # state for this signature once every attempt has resolved
        sig = reservation.slot_signature(self.box.id, '2030-01-15', '10:00', 2)
        self.assertIsNone(reservation.get_client().get(f'hold:{sig}'))
