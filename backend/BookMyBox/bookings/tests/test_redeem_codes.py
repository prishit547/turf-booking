"""Phase 4 — owner-scoped, box-specific redeem codes: apply_redeem_code(),
create_booking_row(redeem_code=...), and the validate_coupon action's
Coupon/RedeemCode fallback + `kind` field."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Coupon
from bookings.services import (
    BookingWriteError, apply_redeem_code, create_booking_row,
)
from rewards.models import RedeemCode

User = get_user_model()


class ApplyRedeemCodeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='rcowner@example.com', username='rcowner@example.com', password='x', role='owner',
        )
        self.other_owner = User.objects.create_user(
            email='rcother@example.com', username='rcother@example.com', password='x', role='owner',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='RC Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.other_box = Box.objects.create(
            owner=self.other_owner, name='Other RC Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.future_date = (timezone.localtime() + timedelta(days=1)).date()

    def test_valid_code_returns_correct_discount(self):
        code = RedeemCode.objects.create(box=self.box, value=Decimal('100.00'))
        redeem, discount = apply_redeem_code(self.box, 1, code.code, self.future_date, '10:00')
        self.assertEqual(redeem.id, code.id)
        self.assertEqual(discount, Decimal('100.00'))

    def test_discount_capped_at_gross_amount(self):
        code = RedeemCode.objects.create(box=self.box, value=Decimal('10000.00'))
        redeem, discount = apply_redeem_code(self.box, 1, code.code, self.future_date, '10:00')
        self.assertEqual(discount, Decimal('500.00'))  # gross for 1 hour

    def test_code_registered_to_different_box_not_found(self):
        code = RedeemCode.objects.create(box=self.other_box, value=Decimal('100.00'))
        with self.assertRaises(ValidationError):
            apply_redeem_code(self.box, 1, code.code, self.future_date, '10:00')

    def test_expired_code_rejected(self):
        code = RedeemCode.objects.create(
            box=self.box, value=Decimal('100.00'), expires_at=timezone.now() - timedelta(days=1),
        )
        with self.assertRaises(ValidationError):
            apply_redeem_code(self.box, 1, code.code, self.future_date, '10:00')

    def test_already_used_code_rejected(self):
        code = RedeemCode.objects.create(box=self.box, value=Decimal('100.00'), is_used=True)
        with self.assertRaises(ValidationError):
            apply_redeem_code(self.box, 1, code.code, self.future_date, '10:00')


class CreateBookingRowWithRedeemCodeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='rcbookowner@example.com', username='rcbookowner@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='rcbookplayer@example.com', username='rcbookplayer@example.com', password='x', role='user',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='RC Booking Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.future_date = (timezone.localtime() + timedelta(days=1)).date()

    def test_booking_gets_discount_and_code_marked_used(self):
        code = RedeemCode.objects.create(box=self.box, value=Decimal('100.00'))
        booking = create_booking_row(
            self.player, self.box.id, self.future_date, '10:00', 1, '11:00', redeem_code=code.code,
        )
        self.assertEqual(booking.total_amount, Decimal('400.00'))
        self.assertEqual(booking.discount_amount, Decimal('100.00'))
        self.assertEqual(booking.coupon_code, code.code)
        code.refresh_from_db()
        self.assertTrue(code.is_used)
        self.assertEqual(code.used_by, self.player)
        self.assertIsNotNone(code.used_at)

    def test_both_coupon_and_redeem_code_rejected(self):
        coupon = Coupon.objects.create(code='SAVE10', discount_type='flat', value=Decimal('10.00'), active=True)
        redeem = RedeemCode.objects.create(box=self.box, value=Decimal('100.00'))
        with self.assertRaises(BookingWriteError):
            create_booking_row(
                self.player, self.box.id, self.future_date, '10:00', 1, '11:00',
                coupon_code=coupon.code, redeem_code=redeem.code,
            )
        redeem.refresh_from_db()
        self.assertFalse(redeem.is_used)


class ValidateCouponActionKindTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='vcowner@example.com', username='vcowner@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='vcplayer@example.com', username='vcplayer@example.com', password='x', role='user',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='VC Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.future_date = (timezone.localtime() + timedelta(days=1)).date()
        token = str(RefreshToken.for_user(self.player).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def _validate(self, code):
        return self.client.post('/api/bookings/coupons/validate/', {
            'code': code,
            'boxId': self.box.id,
            'date': self.future_date.isoformat(),
            'startTime': '10:00',
            'duration': 1,
        }, format='json')

    def test_box_scoped_redeem_code_returns_kind_redeem_code(self):
        redeem = RedeemCode.objects.create(box=self.box, value=Decimal('50.00'))
        response = self._validate(redeem.code)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['valid'])
        self.assertEqual(response.data['kind'], 'redeem_code')
        self.assertEqual(response.data['code'], redeem.code)

    def test_admin_coupon_returns_kind_coupon(self):
        coupon = Coupon.objects.create(code='ADMIN10', discount_type='flat', value=Decimal('10.00'), active=True)
        response = self._validate(coupon.code)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['valid'])
        self.assertEqual(response.data['kind'], 'coupon')

    def test_unknown_code_in_either_table_returns_invalid(self):
        response = self._validate('NOPE12345')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data['valid'])
