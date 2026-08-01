from django.contrib.auth import get_user_model
from django.urls import reverse
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
        self.assertEqual(response.status_code, 400)

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
