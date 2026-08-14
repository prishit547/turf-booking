from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from bookings.services import cancel_booking
from rewards.services import credit_wallet

User = get_user_model()


class CancelRefundTests(APITestCase):
    """cancel_booking() must credit back any wallet-spent amount and mark
    payment_status as Refunded — there's no real payment gateway anywhere in
    this app, so the wallet is the only money the platform ever actually
    collected, and it's the only thing a refund can reverse."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
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
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_cancel_refunds_wallet_amount_used(self):
        credit_wallet(self.user, Decimal('1000'), 'admin_adjustment', 'seed for test')
        self._auth()
        create_response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2, 'useWallet': True},
            format='json',
        )
        self.assertEqual(create_response.status_code, 201)
        booking = Booking.objects.get(pk=create_response.data['id'])
        self.assertEqual(booking.wallet_amount_used, Decimal('1000'))
        self.assertEqual(booking.payment_status, 'Completed')

        self.user.wallet.refresh_from_db()
        self.assertEqual(self.user.wallet.balance, Decimal('0'))

        cancel_booking(booking, cancelled_by=self.user, reason='changed my mind')
        booking.refresh_from_db()
        self.user.wallet.refresh_from_db()

        self.assertEqual(booking.booking_status, 'Cancelled')
        self.assertEqual(booking.payment_status, 'Refunded')
        self.assertEqual(self.user.wallet.balance, Decimal('1000'))
        refund_txn = self.user.wallet.transactions.filter(type='refund').first()
        self.assertIsNotNone(refund_txn)
        self.assertEqual(refund_txn.amount, Decimal('1000'))
        self.assertEqual(refund_txn.booking_id, booking.id)

    def test_cancel_without_wallet_spend_does_not_touch_wallet(self):
        self._auth()
        create_response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        booking = Booking.objects.get(pk=create_response.data['id'])
        self.assertEqual(booking.wallet_amount_used, Decimal('0'))

        cancel_booking(booking, cancelled_by=self.user, reason=None)
        booking.refresh_from_db()

        self.assertEqual(booking.booking_status, 'Cancelled')
        # payment_status was 'Not Required' going in (no gateway, no wallet
        # spend) — nothing was ever collected, so nothing moves to Refunded.
        self.assertEqual(booking.payment_status, 'Not Required')

        from rewards.models import Wallet
        self.assertFalse(Wallet.objects.filter(user=self.user).exists())
