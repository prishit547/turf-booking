# boxes/tests.py

from datetime import date, timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from PIL import Image

from bookings.models import Booking
from boxes.models import Box, PricingRule
from boxes.pricing import resolve_box_price

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
