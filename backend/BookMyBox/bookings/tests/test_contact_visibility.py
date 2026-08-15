from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking

User = get_user_model()


class ContactVisibilityTests(APITestCase):
    """Owner<->customer contact info, scoped to a booking a party actually
    has — never on the public box listing (see boxes/tests* for that
    guarantee already holding on BoxSerializer, untouched here)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='9998887770', location='Mumbai',
        )
        self.stranger = User.objects.create_user(
            email='stranger@example.com', username='stranger@example.com', password='testpass123',
            role='user', phone='9998887771', location='Mumbai',
        )
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='9998887772', location='Mumbai', business_name='Elite Sports',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )

    def _auth(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def _create_booking(self):
        self._auth(self.user)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        return Booking.objects.get(pk=response.data['id'])

    def test_customer_sees_owner_phone_and_email_on_own_booking(self):
        booking = self._create_booking()
        self._auth(self.user)
        response = self.client.get(f'/api/bookings/{booking.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['box_owner_phone'], self.owner.phone)
        self.assertEqual(response.data['box_owner_email'], self.owner.email)

    def test_public_box_listing_never_exposes_owner_contact_info(self):
        response = self.client.get(f'/api/boxes/public/{self.box.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('owner_phone', response.data)
        self.assertNotIn('owner_email', response.data)
        self.assertNotIn('phone', str(response.data.get('owner', '')))

    def test_stranger_gets_404_on_booking_detail(self):
        booking = self._create_booking()
        self._auth(self.stranger)
        response = self.client.get(f'/api/bookings/{booking.id}/')
        self.assertEqual(response.status_code, 404)

    def test_box_owner_sees_customer_phone_via_owner_bookings_endpoint(self):
        """Online booking never had customer_phone set directly (see
        create_booking_row's default) — customer_phone_display must fall
        back to the customer's own profile phone."""
        booking = self._create_booking()
        self.assertEqual(booking.customer_phone, '')  # confirms the known gap this fixes

        self._auth(self.owner)
        response = self.client.get(f'/api/owner_dashboard/bookings/{booking.id}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['customer_phone_display'], self.user.phone)
        self.assertEqual(response.data['user_email'], self.user.email)

    def test_box_owner_also_sees_customer_contact_via_booking_detail(self):
        """Owners reach a booking on their own box via BookingViewSet.retrieve()
        too (per the prior round's own-box grant) — same fallback must hold
        there, since BookingConfirmation.jsx's Customer contact section
        reads from this endpoint's payload, not the owner_dashboard one."""
        booking = self._create_booking()
        self._auth(self.owner)
        response = self.client.get(f'/api/bookings/{booking.id}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['customer_phone_display'], self.user.phone)
        self.assertEqual(response.data['user_email'], self.user.email)

    def test_other_owner_cannot_see_customer_contact_for_someone_elses_box(self):
        booking = self._create_booking()
        other_owner = User.objects.create_user(
            email='rival@example.com', username='rival@example.com', password='testpass123',
            role='owner', phone='9998887773', location='Mumbai', business_name='Rival Sports',
        )
        self._auth(other_owner)
        list_response = self.client.get('/api/owner_dashboard/bookings/')
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data['count'], 0)
        detail_response = self.client.get(f'/api/owner_dashboard/bookings/{booking.id}/')
        self.assertEqual(detail_response.status_code, 404)

    def test_walk_in_customer_phone_is_not_overridden_by_fallback(self):
        """An owner_manual booking already has a real customer_phone —
        customer_phone_display must prefer it over the (nonexistent, no
        user account tied to it beyond the owner as booker) fallback."""
        self._auth(self.owner)
        response = self.client.post(
            '/api/owner_dashboard/bookings/book/',
            {
                'boxId': self.box.id, 'date': '2030-01-20', 'startTime': '09:00', 'duration': 1,
                'customerName': 'Walk-in Wendy', 'customerPhone': '5551234567',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        booking_id = response.data['id']

        detail = self.client.get(f'/api/owner_dashboard/bookings/{booking_id}/')
        self.assertEqual(detail.data['customer_phone_display'], '5551234567')
