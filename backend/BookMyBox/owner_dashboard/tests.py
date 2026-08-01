from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking

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
