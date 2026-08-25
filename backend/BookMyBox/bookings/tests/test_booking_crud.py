from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking

User = get_user_model()


class BookingAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='1234567890',
            location='Mumbai'
        )
        self.owner = User.objects.create_user(
            email='owner@example.com',
            username='owner@example.com',
            password='testpass123',
            role='owner',
            phone='1234567891',
            location='Mumbai',
            business_name='Elite Sports'
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box',
            sport='Cricket',
            sports=['Cricket'],
            location='Mumbai',
            price=500,
            capacity=20,
            owner=self.owner,
            status='approved',
            latitude=19.0760,
            longitude=72.8777,
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_create_booking_success(self):
        self._auth()
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2030-01-15',
                'startTime': '10:00',
                'duration': 2,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Booking.objects.count(), 1)
        booking = Booking.objects.first()
        self.assertEqual(booking.total_amount, 1000)

    def test_cannot_book_past_date(self):
        self._auth()
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2020-01-15',
                'startTime': '10:00',
                'duration': 2,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_book_a_same_day_slot_whose_start_time_has_already_passed(self):
        # Regression: validate_booking_request() used to only compare dates,
        # so a same-day slot could be booked (and paid for) after its own
        # start time had already gone by.
        self._auth()
        now = timezone.localtime()
        if now.hour < 6:
            self.skipTest("Can't construct an elapsed same-day slot before this box's 06:00 opening.")
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': now.date().isoformat(),
                'startTime': '06:00',
                'duration': 1,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('already passed', str(response.data))

    def test_can_still_book_a_same_day_slot_that_has_not_started_yet(self):
        self._auth()
        now = timezone.localtime()
        if now.hour >= 22:
            self.skipTest("Can't construct a same-day future slot this late (box closes at 23:00).")
        future_hour = now.hour + 1
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': now.date().isoformat(),
                'startTime': f'{future_hour:02d}:00',
                'duration': 1,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 201)

    def test_bookings_list_is_paginated(self):
        # Regression: BookingViewSet had no pagination_class, so the
        # customer's own booking list relied on the global 100/page default
        # with no way for the frontend to request page 2+.
        self._auth()
        for i in range(3):
            self.client.post(
                '/api/bookings/',
                {'boxId': self.box.id, 'date': f'2030-01-{15+i}', 'startTime': '10:00', 'duration': 1},
                format='json',
            )
        response = self.client.get('/api/bookings/?page_size=2')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 3)
        self.assertEqual(len(response.data['results']), 2)

    def test_when_upcoming_and_past_split_and_order_correctly(self):
        self._auth()
        past_booking = Booking.objects.create(
            user=self.user, box=self.box, date='2020-01-10', start_time='10:00', end_time='11:00',
            duration=1, total_amount=500, booking_status='Completed',
        )
        future_near = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 1},
            format='json',
        ).data
        future_far = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-06-15', 'startTime': '10:00', 'duration': 1},
            format='json',
        ).data

        upcoming = self.client.get('/api/bookings/?when=upcoming').data
        self.assertEqual(upcoming['count'], 2)
        # Soonest first.
        self.assertEqual([b['id'] for b in upcoming['results']], [future_near['id'], future_far['id']])

        past = self.client.get('/api/bookings/?when=past').data
        self.assertEqual(past['count'], 1)
        self.assertEqual(past['results'][0]['id'], past_booking.id)

    def test_cannot_book_unapproved_box(self):
        self.box.status = 'pending'
        self.box.save()
        self._auth()
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2030-01-15',
                'startTime': '10:00',
                'duration': 2,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_overlap_detection(self):
        self._auth()
        self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2030-01-15',
                'startTime': '10:00',
                'duration': 2,
            },
            format='json'
        )
        # Overlapping booking should fail
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2030-01-15',
                'startTime': '11:00',
                'duration': 2,
            },
            format='json'
        )
        self.assertEqual(response.status_code, 409)

    def test_update_booking_not_allowed(self):
        self._auth()
        booking = Booking.objects.create(
            user=self.user,
            box=self.box,
            date='2030-01-15',
            start_time='10:00',
            end_time='12:00',
            duration=2,
            total_amount=1000,
        )
        response = self.client.put(
            f'/api/bookings/{booking.id}/',
            {'duration': 3},
            format='json'
        )
        self.assertEqual(response.status_code, 405)


class OwnerBookingAccessTests(APITestCase):
    """A box owner can retrieve/cancel a booking made *on their box* via the
    customer-facing BookingViewSet (not just OwnerBookingViewSet's own
    cancel action) — powers the Owner Bookings row -> /booking/:id detail
    view. This widening must stay scoped to retrieve/cancel only: the
    list endpoint must NOT silently merge "bookings I made as a customer"
    with "bookings on my box" — see get_queryset()'s action check."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email='player2@example.com', username='player2@example.com', password='testpass123',
            role='user', phone='1234567892', location='Mumbai',
        )
        self.owner = User.objects.create_user(
            email='owner2@example.com', username='owner2@example.com', password='testpass123',
            role='owner', phone='1234567893', location='Mumbai', business_name='Owner Sports',
        )
        self.box = Box.objects.create(
            name='Owner Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )
        self.booking = Booking.objects.create(
            user=self.customer, box=self.box, date='2030-01-20',
            start_time='10:00', end_time='12:00', duration=2, total_amount=1000,
        )
        # A booking the owner made for themself elsewhere, as a customer on
        # someone else's box — must never leak into the owner-on-their-box
        # widening below.
        self.other_owner = User.objects.create_user(
            email='otherowner@example.com', username='otherowner@example.com', password='testpass123',
            role='owner', phone='1234567894', location='Mumbai', business_name='Other Sports',
        )
        self.other_box = Box.objects.create(
            name='Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=300, capacity=10, owner=self.other_owner, status='approved',
        )
        self.owner_own_booking = Booking.objects.create(
            user=self.owner, box=self.other_box, date='2030-01-21',
            start_time='09:00', end_time='10:00', duration=1, total_amount=300,
        )
        refresh = RefreshToken.for_user(self.owner)
        self.owner_token = str(refresh.access_token)

    def _auth_as_owner(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.owner_token}')

    def test_owner_can_retrieve_booking_on_their_box(self):
        self._auth_as_owner()
        response = self.client.get(f'/api/bookings/{self.booking.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.booking.id)
        self.assertEqual(response.data['box_owner_id'], self.owner.id)

    def test_owner_can_cancel_booking_on_their_box(self):
        self._auth_as_owner()
        response = self.client.post(f'/api/bookings/{self.booking.id}/cancel/')
        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.booking_status, 'Cancelled')

    def test_owner_list_does_not_include_bookings_on_their_box(self):
        self._auth_as_owner()
        response = self.client.get('/api/bookings/')
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        returned_ids = {row['id'] for row in results}
        # Their own personal booking (as a customer elsewhere) shows up...
        self.assertIn(self.owner_own_booking.id, returned_ids)
        # ...but a booking made by someone else on their own box does not —
        # widening `list` here would be a real data-mixing bug, not just noise.
        self.assertNotIn(self.booking.id, returned_ids)
