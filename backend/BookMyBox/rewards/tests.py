from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from bookings.tasks import mark_completed_bookings_task
from . import services
from .models import CashbackRule, ScratchCardConfig, SpinWheelSegment, Wallet
from .services import (
    apply_cashback, credit_wallet, debit_wallet, get_or_create_wallet,
    grant_scratch_card, grant_spin_entitlement, redeem_code, scratch_card, spin_wheel,
)
from .models import OwnerScratchCardSetting, RedeemCode, ScratchCard, ScratchCardAutoGrantSetting

User = get_user_model()


class WalletServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com',
            password='testpass123', role='user',
        )

    def test_credit_wallet_updates_balance_and_ledger(self):
        txn = credit_wallet(self.user, Decimal('50.00'), 'admin_adjustment', 'test')
        wallet = get_or_create_wallet(self.user)
        self.assertEqual(wallet.balance, Decimal('50.00'))
        self.assertEqual(txn.balance_after, Decimal('50.00'))
        self.assertEqual(txn.amount, Decimal('50.00'))

    def test_debit_wallet_rejects_insufficient_balance(self):
        credit_wallet(self.user, Decimal('10.00'), 'admin_adjustment')
        with self.assertRaises(ValidationError):
            debit_wallet(self.user, Decimal('20.00'), 'booking_payment')
        wallet = get_or_create_wallet(self.user)
        self.assertEqual(wallet.balance, Decimal('10.00'))  # unchanged

    def test_debit_wallet_succeeds_within_balance(self):
        credit_wallet(self.user, Decimal('50.00'), 'admin_adjustment')
        debit_wallet(self.user, Decimal('20.00'), 'booking_payment')
        wallet = get_or_create_wallet(self.user)
        self.assertEqual(wallet.balance, Decimal('30.00'))


class BookingCompletionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='player2@example.com', username='player2@example.com', password='x', role='user',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='Test Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        past_date = (timezone.localtime() - timedelta(days=1)).date()
        self.booking = Booking.objects.create(
            user=self.player, box=self.box, date=past_date, start_time='10:00', end_time='11:00',
            duration=1, total_amount=Decimal('500.00'), booking_status='Confirmed',
        )

    def test_mark_completed_bookings_task_flips_past_confirmed_booking(self):
        completed = mark_completed_bookings_task()
        self.assertGreaterEqual(completed, 1)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.booking_status, 'Completed')

    def test_mark_completed_bookings_task_ignores_future_booking(self):
        future_date = (timezone.localtime() + timedelta(days=1)).date()
        future_booking = Booking.objects.create(
            user=self.player, box=self.box, date=future_date, start_time='10:00', end_time='11:00',
            duration=1, total_amount=Decimal('500.00'), booking_status='Confirmed',
        )
        mark_completed_bookings_task()
        future_booking.refresh_from_db()
        self.assertEqual(future_booking.booking_status, 'Confirmed')

    def test_apply_cashback_is_idempotent(self):
        CashbackRule.objects.create(percent=Decimal('10.00'), active=True)
        self.booking.booking_status = 'Completed'
        self.booking.save()

        apply_cashback(self.booking)
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('50.00'))  # 10% of 500

        apply_cashback(self.booking)  # calling again must not double-credit
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('50.00'))

    def test_apply_cashback_respects_max_cap(self):
        CashbackRule.objects.create(percent=Decimal('50.00'), max_cashback=Decimal('20.00'), active=True)
        self.booking.booking_status = 'Completed'
        self.booking.save()
        apply_cashback(self.booking)
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('20.00'))

    def test_apply_cashback_no_active_rule_is_noop(self):
        self.booking.booking_status = 'Completed'
        self.booking.save()
        apply_cashback(self.booking)
        self.assertFalse(Wallet.objects.filter(user=self.player).exists())

    def test_grant_scratch_card_picks_from_active_configs(self):
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('10.00'), weight=1, active=True)
        card = grant_scratch_card(self.player, booking=self.booking)
        self.assertIsNotNone(card)
        self.assertEqual(card.prize_amount, Decimal('10.00'))
        self.assertFalse(card.is_scratched)

    def test_scratch_card_credits_wallet_once(self):
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('15.00'), weight=1, active=True)
        card = grant_scratch_card(self.player, booking=self.booking)
        scratch_card(self.player, card)
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('15.00'))
        with self.assertRaises(ValidationError):
            scratch_card(self.player, card)  # already scratched
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('15.00'))  # unchanged

    def test_spin_wheel_requires_entitlement(self):
        SpinWheelSegment.objects.create(label='Seg', prize_amount=Decimal('5.00'), weight=1, active=True)
        with self.assertRaises(ValidationError):
            spin_wheel(self.player)

    def test_spin_wheel_consumes_entitlement_and_credits_wallet(self):
        SpinWheelSegment.objects.create(label='Seg', prize_amount=Decimal('5.00'), weight=1, active=True)
        grant_spin_entitlement(self.player, booking=self.booking)
        attempt = spin_wheel(self.player)
        self.assertEqual(attempt.prize_amount, Decimal('5.00'))
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('5.00'))
        with self.assertRaises(ValidationError):
            spin_wheel(self.player)  # entitlement already used


class RedeemCodeServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='redeemer@example.com', username='redeemer@example.com', password='x', role='user',
        )

    def test_redeem_code_credits_wallet_and_marks_used(self):
        code = RedeemCode.objects.create(value=Decimal('25.00'))
        redeem_code(self.user, code.code)
        wallet = get_or_create_wallet(self.user)
        self.assertEqual(wallet.balance, Decimal('25.00'))
        code.refresh_from_db()
        self.assertTrue(code.is_used)
        self.assertEqual(code.used_by, self.user)

    def test_redeem_code_rejects_already_used(self):
        code = RedeemCode.objects.create(value=Decimal('25.00'), is_used=True, used_by=self.user)
        with self.assertRaises(ValidationError):
            redeem_code(self.user, code.code)

    def test_redeem_code_rejects_unknown_code(self):
        with self.assertRaises(ValidationError):
            redeem_code(self.user, 'DOESNOTEXIST')

    def test_redeem_code_rejects_box_scoped_code_with_specific_message(self):
        owner = User.objects.create_user(
            email='boxowner@example.com', username='boxowner@example.com', password='x', role='owner',
        )
        box = Box.objects.create(
            owner=owner, name='Scoped Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        code = RedeemCode.objects.create(value=Decimal('25.00'), box=box)
        with self.assertRaises(ValidationError) as ctx:
            redeem_code(self.user, code.code)
        self.assertIn('Scoped Box', str(ctx.exception))
        code.refresh_from_db()
        self.assertFalse(code.is_used)

    def test_redeem_code_unaffected_for_admin_issued_code(self):
        # box=None (admin-issued) codes must still redeem into the wallet fine.
        code = RedeemCode.objects.create(value=Decimal('25.00'))
        redeem_code(self.user, code.code)
        code.refresh_from_db()
        self.assertTrue(code.is_used)


class WalletSpendAtCheckoutTests(TestCase):
    """Booking creation with use_wallet=True — see
    bookings/services.py::create_booking_row's wallet-spend block."""

    def setUp(self):
        from bookings.services import create_booking_row
        self.create_booking_row = create_booking_row
        self.owner = User.objects.create_user(
            email='owner3@example.com', username='owner3@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='player3@example.com', username='player3@example.com', password='x', role='user',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='Wallet Test Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.future_date = (timezone.localtime() + timedelta(days=1)).date()

    def test_wallet_partially_covers_total_leaves_remainder_unpaid(self):
        credit_wallet(self.player, Decimal('100.00'), 'admin_adjustment')
        booking = self.create_booking_row(
            self.player, self.box.id, self.future_date, '10:00', 1, '11:00', use_wallet=True,
        )
        self.assertEqual(booking.wallet_amount_used, Decimal('100.00'))
        self.assertEqual(booking.total_amount, Decimal('500.00'))  # full price, unaffected by wallet spend
        self.assertNotEqual(booking.payment_status, 'Completed')
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('0.00'))

    def test_wallet_fully_covers_total_marks_booking_paid(self):
        credit_wallet(self.player, Decimal('1000.00'), 'admin_adjustment')
        booking = self.create_booking_row(
            self.player, self.box.id, self.future_date, '10:00', 1, '11:00', use_wallet=True,
        )
        self.assertEqual(booking.wallet_amount_used, Decimal('500.00'))
        self.assertEqual(booking.payment_status, 'Completed')
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('500.00'))  # remainder left untouched

    def test_no_wallet_balance_leaves_booking_unaffected(self):
        booking = self.create_booking_row(
            self.player, self.box.id, self.future_date, '10:00', 1, '11:00', use_wallet=True,
        )
        self.assertEqual(booking.wallet_amount_used, Decimal('0.00'))
        self.assertEqual(booking.payment_status, 'Not Required')

    def test_use_wallet_false_never_touches_balance(self):
        credit_wallet(self.player, Decimal('100.00'), 'admin_adjustment')
        booking = self.create_booking_row(
            self.player, self.box.id, self.future_date, '10:00', 1, '11:00', use_wallet=False,
        )
        self.assertEqual(booking.wallet_amount_used, Decimal('0.00'))
        wallet = get_or_create_wallet(self.player)
        self.assertEqual(wallet.balance, Decimal('100.00'))


class ScratchCardAutoGrantSettingTests(TestCase):
    def test_is_enabled_defaults_true_with_no_row(self):
        self.assertTrue(ScratchCardAutoGrantSetting.is_enabled())

    def test_is_enabled_respects_explicit_false_row(self):
        ScratchCardAutoGrantSetting.objects.create(enabled=False)
        self.assertFalse(ScratchCardAutoGrantSetting.is_enabled())

    def test_is_enabled_respects_explicit_true_row(self):
        ScratchCardAutoGrantSetting.objects.create(enabled=True)
        self.assertTrue(ScratchCardAutoGrantSetting.is_enabled())


class OwnerScratchCardSettingTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='ownersetting@example.com', username='ownersetting@example.com', password='x', role='owner',
        )

    def test_is_enabled_for_defaults_true_with_no_row(self):
        self.assertTrue(OwnerScratchCardSetting.is_enabled_for(self.owner))

    def test_is_enabled_for_respects_explicit_false_row(self):
        OwnerScratchCardSetting.objects.create(owner=self.owner, enabled=False)
        self.assertFalse(OwnerScratchCardSetting.is_enabled_for(self.owner))


class OnBookingCompletedScratchCardGatingTests(TestCase):
    """on_booking_completed() must respect both the platform-wide and the
    per-owner scratch-card auto-grant switches (spin entitlements and
    cashback are unaffected by either switch)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='gateowner@example.com', username='gateowner@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='gateplayer@example.com', username='gateplayer@example.com', password='x', role='user',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='Gate Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )
        self.booking = Booking.objects.create(
            user=self.player, box=self.box, date=timezone.now().date(), start_time='10:00', end_time='11:00',
            duration=1, total_amount=Decimal('500.00'), booking_status='Completed',
        )
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('10.00'), weight=1, active=True)

    def test_no_scratch_card_when_platform_switch_off(self):
        ScratchCardAutoGrantSetting.objects.create(enabled=False)
        services.on_booking_completed(self.booking)
        self.assertFalse(ScratchCard.objects.filter(user=self.player).exists())

    def test_no_scratch_card_when_owner_switch_off(self):
        OwnerScratchCardSetting.objects.create(owner=self.owner, enabled=False)
        services.on_booking_completed(self.booking)
        self.assertFalse(ScratchCard.objects.filter(user=self.player).exists())

    def test_scratch_card_granted_when_both_switches_on(self):
        services.on_booking_completed(self.booking)
        self.assertTrue(ScratchCard.objects.filter(user=self.player).exists())


class ScratchCardGrantEndpointTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com', username='admin@example.com', password='x', role='admin',
        )
        self.owner = User.objects.create_user(
            email='grantowner@example.com', username='grantowner@example.com', password='x', role='owner',
        )
        self.player = User.objects.create_user(
            email='grantplayer@example.com', username='grantplayer@example.com', password='x', role='user',
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_admin_grant_creates_card_with_active_config(self):
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('10.00'), weight=1, active=True)
        self._auth(self.admin)
        response = self.client.post('/api/rewards/admin/scratch-cards/grant/', {'user_id': self.player.id}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ScratchCard.objects.filter(user=self.player).exists())

    def test_admin_grant_returns_400_with_no_active_config(self):
        self._auth(self.admin)
        response = self.client.post('/api/rewards/admin/scratch-cards/grant/', {'user_id': self.player.id}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_owner_grant_creates_card_with_active_config(self):
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('10.00'), weight=1, active=True)
        self._auth(self.owner)
        response = self.client.post('/api/rewards/owner/scratch-cards/grant/', {'user_id': self.player.id}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ScratchCard.objects.filter(user=self.player).exists())

    def test_wrong_role_forbidden(self):
        ScratchCardConfig.objects.create(label='Tier', prize_amount=Decimal('10.00'), weight=1, active=True)
        self._auth(self.player)
        admin_response = self.client.post('/api/rewards/admin/scratch-cards/grant/', {'user_id': self.player.id}, format='json')
        self.assertEqual(admin_response.status_code, 403)
        owner_response = self.client.post('/api/rewards/owner/scratch-cards/grant/', {'user_id': self.player.id}, format='json')
        self.assertEqual(owner_response.status_code, 403)


class OwnerRedeemCodeGenerateEndpointTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='codeowner@example.com', username='codeowner@example.com', password='x', role='owner',
        )
        self.other_owner = User.objects.create_user(
            email='otherowner@example.com', username='otherowner@example.com', password='x', role='owner',
        )
        self.box = Box.objects.create(
            owner=self.owner, name='Code Box', sport='Football', price=Decimal('500.00'),
            status='approved', location='Mumbai',
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_generate_forbidden_for_box_caller_does_not_own(self):
        self._auth(self.other_owner)
        response = self.client.post(
            '/api/rewards/owner/redeem-codes/generate/',
            {'box': self.box.id, 'value': '20', 'quantity': 3}, format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(RedeemCode.objects.filter(box=self.box).count(), 0)

    def test_generate_creates_codes_scoped_to_own_box(self):
        self._auth(self.owner)
        response = self.client.post(
            '/api/rewards/owner/redeem-codes/generate/',
            {'box': self.box.id, 'value': '20', 'quantity': 3}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data), 3)
        codes = RedeemCode.objects.filter(box=self.box)
        self.assertEqual(codes.count(), 3)
        for code in codes:
            self.assertEqual(code.box_id, self.box.id)
