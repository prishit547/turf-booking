"""Admin/owner accounts must not be able to book a slot through the
customer-facing flow (POST /api/bookings/, /recurring/, /reserve/,
/confirm/<token>/) — booking as a "player" is reserved for role='user'
accounts. An owner can still add a walk-in booking on their own box via
the separate OwnerBookingViewSet.book action, which must stay completely
unaffected (it has its own IsOwnerUser permission class)."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking

User = get_user_model()


class CustomerOnlyBookingCreationTests(APITestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email='player3@example.com', username='player3@example.com', password='testpass123',
            role='user', phone='9000000001', location='Mumbai',
        )
        self.owner = User.objects.create_user(
            email='owner3@example.com', username='owner3@example.com', password='testpass123',
            role='owner', phone='9000000002', location='Mumbai', business_name='Owner3 Sports',
        )
        self.other_owner = User.objects.create_user(
            email='owner4@example.com', username='owner4@example.com', password='testpass123',
            role='owner', phone='9000000003', location='Mumbai', business_name='Owner4 Sports',
        )
        self.admin = User.objects.create_user(
            email='admin3@example.com', username='admin3@example.com', password='testpass123',
            role='admin', phone='9000000004', location='Mumbai',
        )
        self.box = Box.objects.create(
            name='Customer-Only Test Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )
        self.other_box = Box.objects.create(
            name='Other Owner Box', sport='Football', sports=['Football'], location='Mumbai',
            price=400, capacity=10, owner=self.other_owner, status='approved',
        )

    def _auth_as(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    # -- regression: a real customer can still book normally --------------
    def test_player_can_still_book_normally(self):
        self._auth_as(self.player)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-02-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Booking.objects.filter(user=self.player).count(), 1)

    # -- owner blocked from the customer flow, on ANY box, including own --
    def test_owner_cannot_book_own_box_via_customer_flow(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-02-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn('detail', response.data)
        self.assertEqual(Booking.objects.count(), 0)

    def test_owner_cannot_book_other_owners_box_via_customer_flow(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.other_box.id, 'date': '2030-02-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Booking.objects.count(), 0)

    # -- admin blocked too ------------------------------------------------
    def test_admin_cannot_book_via_customer_flow(self):
        self._auth_as(self.admin)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-02-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Booking.objects.count(), 0)

    # -- other creation surfaces also blocked ------------------------------
    def test_owner_cannot_use_recurring_endpoint(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/bookings/recurring/',
            {'boxId': self.box.id, 'date': '2030-02-18', 'startTime': '09:00', 'duration': 1, 'weeks': 3},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Booking.objects.count(), 0)

    def test_owner_cannot_reserve_a_slot(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/bookings/reserve/',
            {'boxId': self.box.id, 'date': '2030-02-18', 'startTime': '09:00', 'duration': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_cannot_reserve_a_slot(self):
        self._auth_as(self.admin)
        response = self.client.post(
            '/api/bookings/reserve/',
            {'boxId': self.box.id, 'date': '2030-02-18', 'startTime': '09:00', 'duration': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_cannot_confirm_a_hold(self):
        self._auth_as(self.owner)
        response = self.client.post('/api/bookings/confirm/some-token/')
        self.assertEqual(response.status_code, 403)

    # -- existing customer capabilities (view/cancel) stay untouched ------
    def test_admin_can_still_view_bookings_list(self):
        Booking.objects.create(
            user=self.player, box=self.box, date='2030-02-20',
            start_time='10:00', end_time='12:00', duration=2, total_amount=1000,
        )
        self._auth_as(self.admin)
        response = self.client.get('/api/bookings/')
        self.assertEqual(response.status_code, 200)

    def test_owner_can_still_cancel_booking_on_their_box(self):
        booking = Booking.objects.create(
            user=self.player, box=self.box, date='2030-02-20',
            start_time='10:00', end_time='12:00', duration=2, total_amount=1000,
        )
        self._auth_as(self.owner)
        response = self.client.post(f'/api/bookings/{booking.id}/cancel/')
        self.assertEqual(response.status_code, 200)


class OwnerWalkInBookingUnaffectedTests(APITestCase):
    """OwnerBookingViewSet.book (the "Add walk-in booking" action) must
    keep working exactly as before — it has its own IsOwnerUser permission
    class, entirely separate from BookingViewSet's new IsCustomerUser
    gate, so it must not be caught by the customer-only restriction."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner5@example.com', username='owner5@example.com', password='testpass123',
            role='owner', phone='9000000005', location='Mumbai', business_name='Owner5 Sports',
        )
        self.other_owner = User.objects.create_user(
            email='owner6@example.com', username='owner6@example.com', password='testpass123',
            role='owner', phone='9000000006', location='Mumbai', business_name='Owner6 Sports',
        )
        self.box = Box.objects.create(
            name='Walk-in Test Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )
        self.other_box = Box.objects.create(
            name='Walk-in Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=400, capacity=10, owner=self.other_owner, status='approved',
        )

    def _auth_as(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def test_owner_can_still_walk_in_book_their_own_box(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/owner_dashboard/bookings/book/',
            {
                'boxId': self.box.id, 'date': '2030-02-16', 'startTime': '11:00', 'duration': 1,
                'customerName': 'Walk-in Player', 'customerPhone': '9999999999',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(box=self.box, date='2030-02-16', start_time='11:00')
        self.assertEqual(booking.booking_source, 'owner_manual')
        self.assertEqual(booking.payment_status, 'Not Required')
        self.assertEqual(booking.user_id, self.owner.id)

    def test_owner_still_cannot_walk_in_book_someone_elses_box(self):
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/owner_dashboard/bookings/book/',
            {'boxId': self.other_box.id, 'date': '2030-02-16', 'startTime': '11:00', 'duration': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Booking.objects.count(), 0)
