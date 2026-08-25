# boxes/tests.py

from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from PIL import Image

from bookings.models import Booking
from boxes.models import Box, BlockedDate, CommissionRate, PlatformCommissionSetting, PricingRule
from boxes.pricing import resolve_box_price, resolve_commission_rate
from user.models import AdminActionLog

User = get_user_model()


def make_image(name="test.jpg"):
    image = Image.new("RGB", (100, 100), color="red")
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/jpeg")


class OwnerBoxAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            username='owner@example.com',
            password='testpass123',
            role='owner',
            phone='1234567890',
            location='Mumbai',
            business_name='Elite Sports'
        )
        refresh = RefreshToken.for_user(self.owner)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_owner_can_create_box_with_multiple_images(self):
        self._auth()
        img1 = make_image("box1.jpg")
        img2 = make_image("box2.jpg")
        response = self.client.post(
            '/api/boxes/owner/',
            {
                'name': 'Test Cricket Box',
                'sport': 'Cricket',
                'sports': '["Cricket"]',
                'location': 'Mumbai',
                'price': 500,
                'capacity': 20,
                'description': 'A great cricket box',
                'amenities': '["Parking", "Floodlights"]',
                'rules': '[]',
                'images': [img1, img2],
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, 201)
        box = Box.objects.first()
        self.assertIsNotNone(box.image)
        self.assertEqual(len(box.images), 2)
        self.assertTrue(all(path.startswith('box_images/') for path in box.images))

    def test_non_owner_cannot_create_box(self):
        user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='1234567890',
            location='Mumbai'
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        response = self.client.post(
            '/api/boxes/owner/',
            {
                'name': 'Test Box',
                'sport': 'Cricket',
                'location': 'Mumbai',
                'price': 500,
                'capacity': 10,
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, 403)


class ReviewAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            username='owner@example.com',
            password='testpass123',
            role='owner',
            phone='1234567890',
            location='Mumbai',
            business_name='Elite Sports'
        )
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='1234567890',
            location='Mumbai'
        )
        self.box = Box.objects.create(
            name='Test Box',
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
        # A review now requires a completed/confirmed booking on the box —
        # see boxes/views.py's add_review.
        Booking.objects.create(
            user=self.user,
            box=self.box,
            date=date.today() - timedelta(days=1),
            start_time='10:00',
            end_time='11:00',
            duration=1,
            total_amount=500,
            booking_status='Completed',
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_cannot_review_same_box_twice(self):
        self._auth()
        url = f'/api/boxes/public/{self.box.id}/add_review/'
        response = self.client.post(url, {'rating': 5, 'comment': 'Great!'}, format='json')
        self.assertEqual(response.status_code, 201)

        response = self.client.post(url, {'rating': 4, 'comment': 'Still good'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cannot_review_a_box_never_booked(self):
        other_box = Box.objects.create(
            name='Never Booked Box',
            sport='Football',
            sports=['Football'],
            location='Mumbai',
            price=500,
            capacity=20,
            owner=self.owner,
            status='approved',
        )
        self._auth()
        url = f'/api/boxes/public/{other_box.id}/add_review/'
        response = self.client.post(url, {'rating': 5, 'comment': 'Great!'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_box_list_and_detail_expose_review_count_not_full_review_list(self):
        # Regression: BoxSerializer used to nest every review for every box
        # unbounded, shipped even on the browse-boxes list where nothing
        # renders it.
        self._auth()
        self.client.post(f'/api/boxes/public/{self.box.id}/add_review/', {'rating': 5, 'comment': 'Great!'}, format='json')

        list_response = self.client.get('/api/boxes/public/')
        listed_box = next(b for b in list_response.data['results'] if b['id'] == self.box.id)
        self.assertEqual(listed_box['review_count'], 1)
        self.assertNotIn('reviews', listed_box)
        self.assertNotIn('rating_breakdown', listed_box)  # detail-only, not on list()

        detail_response = self.client.get(f'/api/boxes/public/{self.box.id}/')
        self.assertEqual(detail_response.data['review_count'], 1)
        self.assertEqual(detail_response.data['rating_breakdown'], {'1': 0, '2': 0, '3': 0, '4': 0, '5': 1})
        self.assertNotIn('reviews', detail_response.data)

    def test_box_reviews_endpoint_is_paginated(self):
        self._auth()
        self.client.post(f'/api/boxes/public/{self.box.id}/add_review/', {'rating': 5, 'comment': 'Great!'}, format='json')

        response = self.client.get(f'/api/boxes/public/{self.box.id}/reviews/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['comment'], 'Great!')


class ResolveBoxPriceTests(APITestCase):
    """Unit tests for boxes/pricing.py's resolve_box_price() — no HTTP,
    just the resolution logic both create_booking_row() and apply_coupon()
    depend on agreeing exactly."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com',
            password='testpass123', role='owner',
        )
        self.box = Box.objects.create(
            name='Test Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )

    def test_falls_back_to_flat_price_with_no_rules(self):
        # 2026-08-15 is a Saturday.
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 15), '18:00'), 500)

    def test_weekend_rule_applies_on_weekend(self):
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 15), '19:00'), 900)  # Saturday

    def test_weekend_rule_does_not_apply_on_weekday(self):
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 17), '19:00'), 500)  # Monday

    def test_rule_does_not_apply_outside_its_time_window(self):
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 15), '10:00'), 500)

    def test_all_days_rule_applies_regardless_of_weekday(self):
        PricingRule.objects.create(box=self.box, applies_to='all', start_time='06:00', end_time='09:00', price=350)
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 17), '06:00'), 350)  # Monday
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 15), '06:00'), 350)  # Saturday

    def test_resolution_is_by_start_time_not_full_span(self):
        # A rule covering only 18:00-22:00 shouldn't match a 17:00 start,
        # even though a booking there could run into the rule's window.
        PricingRule.objects.create(box=self.box, applies_to='all', start_time='18:00', end_time='22:00', price=900)
        self.assertEqual(resolve_box_price(self.box, date(2026, 8, 15), '17:00'), 500)


class ResolveCommissionRateTests(APITestCase):
    """Unit tests for boxes/pricing.py's resolve_commission_rate() —
    replaces what used to be a hardcoded 0.1 literal in three places."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner2@example.com', username='owner2@example.com',
            password='testpass123', role='owner',
        )

    def test_falls_back_to_platform_default_with_no_override(self):
        from django.conf import settings
        rate = resolve_commission_rate(self.owner, 'Cricket', date(2026, 8, 15))
        self.assertEqual(rate, Decimal(str(settings.DEFAULT_COMMISSION_RATE)))

    def test_owner_sport_override_takes_precedence(self):
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('15.00'))
        rate = resolve_commission_rate(self.owner, 'Cricket', date(2026, 8, 15))
        self.assertEqual(rate, Decimal('0.15'))

    def test_override_is_scoped_to_sport(self):
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('15.00'))
        from django.conf import settings
        rate = resolve_commission_rate(self.owner, 'Football', date(2026, 8, 15))
        self.assertEqual(rate, Decimal(str(settings.DEFAULT_COMMISSION_RATE)))

    def test_effective_from_versioning_uses_latest_applicable_rate(self):
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('10.00'), effective_from=date(2026, 1, 1))
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('20.00'), effective_from=date(2026, 6, 1))
        # Before the second rate kicks in, the first still applies.
        self.assertEqual(resolve_commission_rate(self.owner, 'Cricket', date(2026, 3, 1)), Decimal('0.10'))
        # After, the newer rate applies — past bookings' commission isn't rewritten.
        self.assertEqual(resolve_commission_rate(self.owner, 'Cricket', date(2026, 7, 1)), Decimal('0.20'))

    def test_falls_back_to_platform_commission_setting_when_no_override(self):
        """Once an admin sets a platform-wide default via
        PlatformCommissionSetting, resolve_commission_rate() should use it
        instead of settings.DEFAULT_COMMISSION_RATE for any owner/sport
        without its own override."""
        PlatformCommissionSetting.objects.create(default_rate=Decimal('25.00'))
        rate = resolve_commission_rate(self.owner, 'Cricket', date(2026, 8, 15))
        self.assertEqual(rate, Decimal('0.25'))

    def test_owner_override_still_beats_platform_setting(self):
        PlatformCommissionSetting.objects.create(default_rate=Decimal('25.00'))
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('15.00'))
        rate = resolve_commission_rate(self.owner, 'Cricket', date(2026, 8, 15))
        self.assertEqual(rate, Decimal('0.15'))


class PlatformCommissionSettingTests(APITestCase):
    """Unit tests for PlatformCommissionSetting.get_rate_fraction()."""

    def test_falls_back_to_settings_default_with_no_row(self):
        from django.conf import settings
        self.assertEqual(
            PlatformCommissionSetting.get_rate_fraction(),
            Decimal(str(settings.DEFAULT_COMMISSION_RATE)),
        )

    def test_returns_db_value_once_a_row_exists(self):
        PlatformCommissionSetting.objects.create(default_rate=Decimal('12.50'))
        self.assertEqual(PlatformCommissionSetting.get_rate_fraction(), Decimal('0.125'))


class AdminPlatformCommissionAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin3@example.com', username='admin3@example.com', password='x', role='admin',
        )
        self.owner = User.objects.create_user(
            email='owner5@example.com', username='owner5@example.com', password='x', role='owner',
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_get_returns_settings_default_when_no_row(self):
        from django.conf import settings
        self._auth(self.admin)
        response = self.client.get('/api/boxes/admin/commission-default/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['default_rate'], float(settings.DEFAULT_COMMISSION_RATE) * 100)

    def test_admin_can_patch_default_rate(self):
        self._auth(self.admin)
        response = self.client.patch('/api/boxes/admin/commission-default/', {'default_rate': 18}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(str(response.data['default_rate'])), Decimal('18.00'))
        self.assertTrue(PlatformCommissionSetting.objects.filter(default_rate=Decimal('18.00')).exists())

    def test_non_admin_forbidden_on_get_and_patch(self):
        self._auth(self.owner)
        get_response = self.client.get('/api/boxes/admin/commission-default/')
        patch_response = self.client.patch('/api/boxes/admin/commission-default/', {'default_rate': 18}, format='json')
        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)


class AdminCommissionRateAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin2@example.com', username='admin2@example.com', password='x', role='admin',
        )
        self.owner = User.objects.create_user(
            email='owner4@example.com', username='owner4@example.com', password='x', role='owner',
        )
        refresh = RefreshToken.for_user(self.admin)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_admin_can_create_commission_rate(self):
        self._auth()
        response = self.client.post('/api/boxes/admin/commission-rates/', {
            'owner': self.owner.id, 'sport': 'Cricket', 'rate': 12.5,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(CommissionRate.objects.filter(owner=self.owner, sport='Cricket', rate=Decimal('12.5')).exists())

    def test_non_admin_cannot_create_commission_rate(self):
        refresh = RefreshToken.for_user(self.owner)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        response = self.client.post('/api/boxes/admin/commission-rates/', {
            'owner': self.owner.id, 'sport': 'Cricket', 'rate': 12.5,
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_commission_rates_list_is_paginated(self):
        self._auth()
        response = self.client.get('/api/boxes/admin/commission-rates/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)

    def test_current_returns_only_latest_row_per_owner_sport(self):
        self._auth()
        older = CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('10'), effective_from=date(2020, 1, 1))
        newer = CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=Decimal('15'), effective_from=date(2025, 1, 1))
        response = self.client.get('/api/boxes/admin/commission-rates/current/')
        self.assertEqual(response.status_code, 200)
        ids = [r['id'] for r in response.data]
        self.assertIn(newer.id, ids)
        self.assertNotIn(older.id, ids)


class PricingRuleAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com',
            password='testpass123', role='owner',
        )
        self.other_owner = User.objects.create_user(
            email='other-owner@example.com', username='other-owner@example.com',
            password='testpass123', role='owner',
        )
        self.box = Box.objects.create(
            name='Test Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        refresh = RefreshToken.for_user(self.owner)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_owner_can_create_pricing_rule(self):
        self._auth()
        response = self.client.post('/api/boxes/pricing-rules/', {
            'box': self.box.id, 'applies_to': 'weekend', 'start_time': '18:00', 'end_time': '22:00', 'price': 900,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PricingRule.objects.filter(box=self.box).count(), 1)

    def test_overlapping_rule_rejected(self):
        self._auth()
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        response = self.client.post('/api/boxes/pricing-rules/', {
            'box': self.box.id, 'applies_to': 'weekend', 'start_time': '20:00', 'end_time': '23:00', 'price': 1000,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_all_days_rule_overlaps_existing_weekend_rule(self):
        self._auth()
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        response = self.client.post('/api/boxes/pricing-rules/', {
            'box': self.box.id, 'applies_to': 'all', 'start_time': '19:00', 'end_time': '20:00', 'price': 700,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_non_overlapping_rule_accepted(self):
        self._auth()
        PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        response = self.client.post('/api/boxes/pricing-rules/', {
            'box': self.box.id, 'applies_to': 'weekend', 'start_time': '06:00', 'end_time': '09:00', 'price': 350,
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_cannot_create_rule_on_another_owners_box(self):
        other_box = Box.objects.create(
            name='Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=500, capacity=20, owner=self.other_owner, status='approved',
        )
        self._auth()
        response = self.client.post('/api/boxes/pricing-rules/', {
            'box': other_box.id, 'applies_to': 'weekend', 'start_time': '18:00', 'end_time': '22:00', 'price': 900,
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_owner_can_delete_own_pricing_rule(self):
        self._auth()
        rule = PricingRule.objects.create(box=self.box, applies_to='weekend', start_time='18:00', end_time='22:00', price=900)
        response = self.client.delete(f'/api/boxes/pricing-rules/{rule.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(PricingRule.objects.filter(pk=rule.id).exists())


class BlockedDateConflictTests(APITestCase):
    """BlockedDateViewSet.create() must not silently orphan paid Confirmed
    bookings when an owner blocks a date — it should reject by default
    (surfacing exactly which bookings conflict) and only cascade-cancel
    with refunds when the owner explicitly passes force=true. See
    bookings/services.py's cancel_booking() for the shared refund/notify
    logic this reuses instead of duplicating."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com',
            password='testpass123', role='owner', phone='1234567890', location='Mumbai',
        )
        self.other_owner = User.objects.create_user(
            email='other-owner@example.com', username='other-owner@example.com',
            password='testpass123', role='owner', phone='1234567891', location='Mumbai',
        )
        self.customer = User.objects.create_user(
            email='player@example.com', username='player@example.com',
            password='testpass123', role='user', phone='1234567892', location='Mumbai',
            first_name='Riya', last_name='Shah',
        )
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.other_box = Box.objects.create(
            name='Other Box', sport='Football', sports=['Football'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.target_date = date.today() + timedelta(days=10)
        self.other_date = date.today() + timedelta(days=11)
        refresh = RefreshToken.for_user(self.owner)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def _make_confirmed_booking(self, box=None, on_date=None, start_time='10:00', wallet_amount_used=Decimal('0')):
        return Booking.objects.create(
            user=self.customer, box=box or self.box, date=on_date or self.target_date,
            start_time=start_time, end_time='11:00', duration=1, total_amount=Decimal('500'),
            payment_status='Completed' if wallet_amount_used else 'Not Required',
            booking_status='Confirmed', wallet_amount_used=wallet_amount_used,
        )

    def test_blocking_date_with_no_bookings_still_works(self):
        """Regression check: the original no-conflict path must behave
        exactly as before."""
        self._auth()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': self.box.id, 'date': self.target_date.isoformat(), 'reason': 'Maintenance',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(BlockedDate.objects.filter(box=self.box, date=self.target_date).count(), 1)
        self.assertNotIn('cancelled_bookings_count', response.data)

    def test_blocking_date_with_confirmed_booking_rejected_without_force(self):
        self._auth()
        booking = self._make_confirmed_booking()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': self.box.id, 'date': self.target_date.isoformat(), 'reason': 'Maintenance',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('confirmed booking', response.data['detail'])
        self.assertEqual(len(response.data['conflicting_bookings']), 1)
        conflict = response.data['conflicting_bookings'][0]
        self.assertEqual(conflict['id'], booking.id)
        self.assertEqual(conflict['customer_name'], 'Riya Shah')
        self.assertEqual(conflict['start_time'], '10:00')

        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'Confirmed')
        self.assertFalse(BlockedDate.objects.filter(box=self.box, date=self.target_date).exists())

    def test_conflict_response_shows_walk_in_customer_name_not_owner(self):
        """A walk-in/manual booking's `user` FK is the owner themselves (see
        OwnerBookingViewSet.book() in owner_dashboard/views.py) — the real
        customer's name lives in customer_name. The conflict payload must
        match OwnerDashboard.jsx's own display rule (booking_source ==
        'owner_manual' ? customer_name : user_name), or the owner sees their
        own name instead of the walk-in customer's."""
        walk_in = Booking.objects.create(
            user=self.owner, box=self.box, date=self.target_date,
            start_time='09:00', end_time='10:00', duration=1, total_amount=Decimal('500'),
            payment_status='Not Required', booking_status='Confirmed',
            booking_source='owner_manual', created_by=self.owner, customer_name='Walk-in Wanda',
        )
        self._auth()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': self.box.id, 'date': self.target_date.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        conflict = next(c for c in response.data['conflicting_bookings'] if c['id'] == walk_in.id)
        self.assertEqual(conflict['customer_name'], 'Walk-in Wanda')

    def test_blocking_with_force_cancels_refunds_and_creates_block(self):
        from rewards.services import credit_wallet, debit_wallet

        credit_wallet(self.customer, Decimal('500'), 'admin_adjustment', 'seed for test')
        debit_wallet(self.customer, Decimal('500'), 'booking_payment', 'seed spend')
        self.customer.wallet.refresh_from_db()
        self.assertEqual(self.customer.wallet.balance, Decimal('0'))

        booking = self._make_confirmed_booking(wallet_amount_used=Decimal('500'))
        # A booking on a different date on the same box, and one on a
        # different box on the same date — neither should be touched.
        other_date_booking = self._make_confirmed_booking(on_date=self.other_date)
        other_box_booking = self._make_confirmed_booking(box=self.other_box)

        self._auth()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': self.box.id, 'date': self.target_date.isoformat(), 'reason': 'Maintenance', 'force': True,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get('cancelled_bookings_count'), 1)
        self.assertIn('cancelled and refunded', response.data.get('detail', ''))

        booking.refresh_from_db()
        self.assertEqual(booking.booking_status, 'Cancelled')
        self.assertEqual(booking.payment_status, 'Refunded')
        self.assertEqual(booking.cancelled_by_id, self.owner.id)

        self.customer.wallet.refresh_from_db()
        self.assertEqual(self.customer.wallet.balance, Decimal('500'))
        refund_txn = self.customer.wallet.transactions.filter(type='refund', booking=booking).first()
        self.assertIsNotNone(refund_txn)
        self.assertEqual(refund_txn.amount, Decimal('500'))

        self.assertTrue(BlockedDate.objects.filter(box=self.box, date=self.target_date).exists())

        other_date_booking.refresh_from_db()
        other_box_booking.refresh_from_db()
        self.assertEqual(other_date_booking.booking_status, 'Confirmed')
        self.assertEqual(other_box_booking.booking_status, 'Confirmed')

    def test_force_rolls_back_atomically_when_a_conflicting_booking_cannot_be_cancelled(self):
        """cancel_booking() enforces a 2-hour cancellation-notice guard. If
        one of several conflicting bookings falls inside that window, the
        whole cascade must roll back — no partial cancellation, no
        BlockedDate created."""
        from django.utils import timezone as dj_timezone

        near_start = (dj_timezone.now() + timedelta(minutes=30))
        near_date = near_start.date()
        cancellable = Booking.objects.create(
            user=self.customer, box=self.box, date=near_date, start_time='23:59', end_time='23:59',
            duration=1, total_amount=Decimal('500'), payment_status='Not Required',
            booking_status='Confirmed',
        )
        too_soon = Booking.objects.create(
            user=self.customer, box=self.box, date=near_date,
            start_time=near_start.strftime('%H:%M'), end_time='23:59',
            duration=1, total_amount=Decimal('500'), payment_status='Not Required',
            booking_status='Confirmed',
        )

        self._auth()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': self.box.id, 'date': near_date.isoformat(), 'reason': 'Maintenance', 'force': True,
        }, format='json')
        self.assertEqual(response.status_code, 400)

        cancellable.refresh_from_db()
        too_soon.refresh_from_db()
        self.assertEqual(cancellable.booking_status, 'Confirmed')
        self.assertEqual(too_soon.booking_status, 'Confirmed')
        self.assertFalse(BlockedDate.objects.filter(box=self.box, date=near_date).exists())

    def test_cannot_force_block_another_owners_box(self):
        foreign_box = Box.objects.create(
            name='Foreign Box', sport='Tennis', sports=['Tennis'], location='Pune',
            price=400, capacity=10, owner=self.other_owner, status='approved',
        )
        self._auth()
        response = self.client.post('/api/boxes/blocked-dates/', {
            'box': foreign_box.id, 'date': self.target_date.isoformat(), 'force': True,
        }, format='json')
        self.assertEqual(response.status_code, 404)


class SuspendedOwnerBoxVisibilityTests(APITestCase):
    """Owner suspend (admin sets is_active=False) must actually stop the
    owner's boxes from being publicly bookable, while leaving the owner's
    own box-management view and admin's view unaffected — see
    boxes/views.py's PublicBoxViewSet (list/get_queryset/locations/stats)
    and bookings/services.py::create_booking_row."""

    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            email='admin-suspend@example.com', username='admin-suspend@example.com',
            password='testpass123', role='admin',
        )
        self.owner = User.objects.create_user(
            email='suspendable-owner@example.com', username='suspendable-owner@example.com',
            password='testpass123', role='owner', business_name='Suspendable Sports',
        )
        self.player = User.objects.create_user(
            email='player-suspend-test@example.com', username='player-suspend-test@example.com',
            password='testpass123', role='user',
        )
        self.box = Box.objects.create(
            name='Suspendable Owner Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.player_token = str(RefreshToken.for_user(self.player).access_token)

    def tearDown(self):
        cache.clear()

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def _public_box_ids(self):
        # cache_page(PUBLIC_BOX_CACHE_TTL) caches this endpoint by full URL —
        # clear it so each call reflects the current DB state, not a
        # pre-suspension cached response.
        cache.clear()
        response = self.client.get('/api/boxes/public/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        return [b['id'] for b in results]

    def test_active_owner_box_visible_in_public_listing(self):
        self._auth(self.player_token)
        self.assertIn(self.box.id, self._public_box_ids())

    def test_suspended_owner_box_hidden_from_public_listing(self):
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        self._auth(self.player_token)
        self.assertNotIn(self.box.id, self._public_box_ids())

    def test_suspended_owner_box_still_visible_to_admin(self):
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        self._auth(self.admin_token)
        response = self.client.get('/api/boxes/owner/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertIn(self.box.id, [b['id'] for b in results])

    def test_suspended_owner_still_sees_own_box_via_owner_dashboard_queryset(self):
        """The owner-facing OwnerBoxViewSet.get_queryset() deliberately does
        NOT filter by owner__is_active — a suspended owner should still be
        able to see/manage their own boxes, just not be bookable by
        customers. Uses force_authenticate (bypasses JWT authentication)
        because DRF SimpleJWT's own authentication layer independently
        rejects every request from an is_active=False user account
        (CHECK_USER_IS_ACTIVE, on by default) — a separate, pre-existing
        account-wide lockout this task doesn't touch. This test isolates
        and confirms the view/queryset-level behavior this task IS
        responsible for."""
        from boxes.views import OwnerBoxViewSet

        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])

        self.client.force_authenticate(user=self.owner)
        response = self.client.get('/api/boxes/owner/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        results = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertIn(self.box.id, [b['id'] for b in results])

    def test_booking_creation_rejected_for_suspended_owners_box(self):
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        self.client.force_authenticate(user=self.player)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-15', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('temporarily unavailable', str(response.data).lower())
        self.assertFalse(Booking.objects.filter(box=self.box).exists())

    def test_booking_creation_still_works_for_active_owners_box(self):
        self.client.force_authenticate(user=self.player)
        response = self.client.post(
            '/api/bookings/',
            {'boxId': self.box.id, 'date': '2030-01-16', 'startTime': '10:00', 'duration': 2},
            format='json',
        )
        self.assertEqual(response.status_code, 201)


class BoxApprovalAuditLogTests(APITestCase):
    """AdminActionLog rows for the admin box approve/reject actions —
    see boxes/views.py's AdminBoxViewSet.approve()/reject() and
    user/audit.py::log_admin_action()."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-auditbox@example.com', username='admin-auditbox@example.com',
            password='testpass123', role='admin',
        )
        self.owner = User.objects.create_user(
            email='owner-auditbox@example.com', username='owner-auditbox@example.com',
            password='testpass123', role='owner', business_name='Audit Box Sports',
        )
        self.box = Box.objects.create(
            name='Pending Audit Box', sport='Tennis', sports=['Tennis'], location='Pune',
            price=300, capacity=10, owner=self.owner, status='pending',
        )
        self.client.force_authenticate(user=self.admin)

    def test_approve_writes_audit_log_row(self):
        response = self.client.post(f'/api/boxes/admin/{self.box.id}/approve/')
        self.assertEqual(response.status_code, 200)
        log = AdminActionLog.objects.filter(action='box.approve', target_id=str(self.box.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.target_type, 'Box')
        self.assertEqual(log.target_repr, self.box.name)

    def test_reject_writes_audit_log_row_with_reason(self):
        response = self.client.post(f'/api/boxes/admin/{self.box.id}/reject/', {'reason': 'Bad photos'}, format='json')
        self.assertEqual(response.status_code, 200)
        log = AdminActionLog.objects.filter(action='box.reject', target_id=str(self.box.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.details.get('reason'), 'Bad photos')


class PendingBoxesPaginationTests(APITestCase):
    """Regression: AdminBoxViewSet.list_pending is a bare ViewSet action, so
    it never got the automatic pagination a ModelViewSet.list() gets — it
    used to return the entire approval queue unbounded."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-pending@example.com', username='admin-pending@example.com',
            password='testpass123', role='admin',
        )
        self.owner = User.objects.create_user(
            email='owner-pending@example.com', username='owner-pending@example.com',
            password='testpass123', role='owner', business_name='Pending Sports',
        )
        for i in range(3):
            Box.objects.create(
                name=f'Pending Box {i}', sport='Tennis', sports=['Tennis'], location='Pune',
                price=300, capacity=10, owner=self.owner, status='pending',
            )
        self.client.force_authenticate(user=self.admin)

    def test_pending_boxes_list_is_paginated(self):
        response = self.client.get('/api/boxes/admin/pending/?page_size=2')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 3)
        self.assertEqual(len(response.data['results']), 2)
