from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from rewards.models import ScratchCard, SpinEntitlement, Wallet, WalletTransaction

User = get_user_model()


class MarkNoShowTests(APITestCase):
    """POST /owner_dashboard/bookings/<id>/mark-no-show/ — deliberately
    distinct from cancel: no refund, no reward-granting. Only legal on a
    Confirmed booking whose start time has already passed."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123',
            role='owner', phone='1234567891', location='Mumbai', business_name='Elite Sports',
        )
        self.other_owner = User.objects.create_user(
            email='otherowner@example.com', username='otherowner@example.com', password='testpass123',
            role='owner', phone='1234567893', location='Mumbai', business_name='Rival Sports',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
            latitude=19.0760, longitude=72.8777,
        )

    def _auth(self, user):
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def _past_confirmed_booking(self):
        past = timezone.localtime() - timedelta(hours=3)
        return Booking.objects.create(
            user=self.user, box=self.box, date=past.date(),
            start_time=past.strftime('%H:%M'),
            end_time=(past + timedelta(hours=1)).strftime('%H:%M'),
            duration=1, total_amount=Decimal('500'), booking_status='Confirmed',
        )

    def _future_confirmed_booking(self):
        future = timezone.localtime() + timedelta(days=1)
        return Booking.objects.create(
            user=self.user, box=self.box, date=future.date(),
            start_time=future.strftime('%H:%M'),
            end_time=(future + timedelta(hours=1)).strftime('%H:%M'),
            duration=1, total_amount=Decimal('500'), booking_status='Confirmed',
        )

    def test_owner_can_mark_past_confirmed_booking_as_no_show(self):
        booking = self._past_confirmed_booking()
        self._auth(self.owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'No-show')

    def test_cannot_mark_future_booking_as_no_show(self):
        booking = self._future_confirmed_booking()
        self._auth(self.owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 400)
        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'Confirmed')

    def test_cannot_mark_non_confirmed_booking_as_no_show(self):
        booking = self._past_confirmed_booking()
        booking.booking_status = 'Cancelled'
        booking.save(update_fields=['booking_status'])
        self._auth(self.owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 400)

    def test_no_show_does_not_refund_wallet_or_touch_payment_status(self):
        booking = self._past_confirmed_booking()
        booking.wallet_amount_used = Decimal('200')
        booking.payment_status = 'Completed'
        booking.save(update_fields=['wallet_amount_used', 'payment_status'])

        self._auth(self.owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(booking.payment_status, 'Completed')  # never moved to Refunded
        self.assertFalse(WalletTransaction.objects.filter(booking=booking, type='refund').exists())
        self.assertFalse(Wallet.objects.filter(user=self.user).exists())  # no refund ever created one

    def test_no_show_does_not_grant_rewards(self):
        booking = self._past_confirmed_booking()
        self._auth(self.owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(ScratchCard.objects.filter(booking=booking).exists())
        self.assertFalse(SpinEntitlement.objects.filter(booking=booking).exists())
        booking.refresh_from_db()
        self.assertIsNone(booking.cashback_credited_at)

    def test_another_owner_cannot_mark_no_show_on_someone_elses_box(self):
        booking = self._past_confirmed_booking()
        self._auth(self.other_owner)
        response = self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        self.assertEqual(response.status_code, 404)  # not in this owner's get_queryset() at all
        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'Confirmed')

    def test_mark_completed_bookings_task_skips_no_show_rows(self):
        from bookings.tasks import mark_completed_bookings_task

        booking = self._past_confirmed_booking()
        self._auth(self.owner)
        self.client.post(f'/api/owner_dashboard/bookings/{booking.id}/mark-no-show/')
        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'No-show')

        mark_completed_bookings_task()
        booking.refresh_from_db()
        # Still No-show — the hourly completion sweep only ever touches rows
        # still booking_status='Confirmed', so it must leave this alone.
        self.assertEqual(booking.booking_status, 'No-show')
        self.assertFalse(ScratchCard.objects.filter(booking=booking).exists())
