from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from user.models import Notification

User = get_user_model()


class RescheduleTests(APITestCase):
    """POST /bookings/<id>/reschedule/ — moves date/start_time (and the
    correspondingly-shifted end_time) while keeping box/duration/
    total_amount fixed. See bookings/services.py::reschedule_booking."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        self.other_user = User.objects.create_user(
            email='other@example.com', username='other@example.com', password='testpass123',
            role='user', phone='1234567892', location='Mumbai',
        )
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='1234567891', location='Mumbai', business_name='Elite Sports',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )

    def _auth(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def _create_booking(self, *, date='2030-01-15', start_time='10:00', duration=2):
        self._auth(self.user)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': date, 'startTime': start_time, 'duration': duration},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        return Booking.objects.get(pk=response.data['id'])

    def test_customer_can_reschedule_own_booking_within_window(self):
        booking = self._create_booking()
        original_total = booking.total_amount

        self._auth(self.user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(str(booking.date), '2030-01-16')
        self.assertEqual(booking.start_time, '14:00')
        self.assertEqual(booking.end_time, '16:00')
        self.assertEqual(booking.duration, 2)
        self.assertEqual(booking.total_amount, original_total)
        self.assertIsNotNone(booking.rescheduled_at)
        self.assertEqual(str(booking.original_date), '2030-01-15')
        self.assertEqual(booking.original_start_time, '10:00')

    def test_reschedule_notifies_the_box_owner_when_customer_reschedules(self):
        booking = self._create_booking()
        Notification.objects.all().delete()

        self._auth(self.user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(Notification.objects.filter(user=self.owner, title__icontains='rescheduled').exists())
        self.assertFalse(Notification.objects.filter(user=self.user, title__icontains='rescheduled').exists())

    def test_owner_can_reschedule_booking_on_their_box_and_customer_is_notified(self):
        booking = self._create_booking()
        Notification.objects.all().delete()

        self._auth(self.owner)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-17', 'start_time': '09:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(str(booking.date), '2030-01-17')
        self.assertEqual(booking.start_time, '09:00')
        self.assertTrue(Notification.objects.filter(user=self.user, title__icontains='rescheduled').exists())

    def test_stranger_cannot_reschedule(self):
        # A true stranger (not the booker, no accepted invite, not the box
        # owner) isn't even in get_queryset()'s own_or_participant filter for
        # this action, so get_object() 404s before the explicit permission
        # check in the view ever runs — same shape as retrieve for a
        # stranger (see test_contact_visibility.py's equivalent case) and
        # distinct from an accepted-invite participant, who IS visible but
        # gets an explicit 403 (see test_invites.py's cancel-rights test).
        booking = self._create_booking()
        self._auth(self.other_user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_rejected_within_two_hour_cutoff(self):
        # Start time inside the next 2 hours, relative to "now" — the DB
        # write itself doesn't validate against "now" (only against
        # opening/closing hours and the past-date guard on create), so this
        # is created directly rather than through the create endpoint, same
        # as CancelRefundTests' pattern would for an equivalent case.
        near_start = timezone.localtime() + timedelta(minutes=30)
        booking = Booking.objects.create(
            user=self.user, box=self.box, date=near_start.date(),
            start_time=near_start.strftime('%H:%M'),
            end_time=(near_start + timedelta(hours=1)).strftime('%H:%M'),
            duration=1, total_amount=Decimal('500'), booking_status='Confirmed',
        )
        self._auth(self.user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-20', 'start_time': '10:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('2 hours', response.data['detail'])
        booking.refresh_from_db()
        self.assertIsNone(booking.rescheduled_at)

    def test_rejected_when_new_slot_conflicts_with_existing_booking(self):
        booking = self._create_booking(date='2030-01-15', start_time='10:00', duration=2)
        # A second, unrelated booking already occupies the slot we'll try to
        # move into.
        self._auth(self.other_user)
        blocker_response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-16', 'startTime': '14:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(blocker_response.status_code, 201, blocker_response.data)

        self._auth(self.user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 409, response.data)
        booking.refresh_from_db()
        self.assertIsNone(booking.rescheduled_at)
        self.assertEqual(str(booking.date), '2030-01-15')

    def test_only_one_reschedule_allowed(self):
        booking = self._create_booking()
        self._auth(self.user)
        first = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(first.status_code, 200, first.data)

        second = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-18', 'start_time': '11:00'},
            format='json',
        )
        self.assertEqual(second.status_code, 400)
        self.assertIn('already been rescheduled', second.data['detail'])
        booking.refresh_from_db()
        # The original slot is preserved from the FIRST reschedule, not
        # overwritten by the rejected second attempt.
        self.assertEqual(str(booking.original_date), '2030-01-15')
        self.assertEqual(str(booking.date), '2030-01-16')

    def test_only_confirmed_bookings_can_be_rescheduled(self):
        booking = self._create_booking()
        booking.booking_status = 'Cancelled'
        booking.save(update_fields=['booking_status'])

        self._auth(self.user)
        response = self.client.post(
            f'/api/bookings/{booking.id}/reschedule/',
            {'date': '2030-01-16', 'start_time': '14:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
