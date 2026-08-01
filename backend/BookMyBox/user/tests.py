from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from bookings.models import Booking
from boxes.models import Box

User = get_user_model()


class UserOnboardingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='',
            location=''
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_onboarding_rejects_role_self_elevation(self):
        """A regular user must not be able to elevate themselves to owner."""
        self._auth()
        response = self.client.post(
            '/api/user/complete-onboarding/',
            {
                'phone': '1234567890',
                'location': 'Mumbai',
                'role': 'owner',
                'business_name': 'My Box'
            },
            format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, 'user')

    def test_onboarding_accepts_basic_profile_completion(self):
        """A user should be able to complete phone/location without changing role."""
        self._auth()
        response = self.client.post(
            '/api/user/complete-onboarding/',
            {
                'phone': '1234567890',
                'location': 'Mumbai'
            },
            format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, 'user')
        self.assertEqual(self.user.phone, '1234567890')


class UserRolePermissionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='1234567890',
            location='Mumbai'
        )
        refresh = RefreshToken.for_user(self.user)
        self.access_token = str(refresh.access_token)

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_non_owner_cannot_create_box(self):
        """Only owners/admins should be able to create boxes."""
        self._auth()
        response = self.client.post(
            '/api/boxes/owner/',
            {
                'name': 'Test Box',
                'sport': 'Cricket',
                'sports': ['Cricket'],
                'location': 'Mumbai',
                'price': 500,
                'capacity': 10,
                'description': 'Test',
                'amenities': ['Parking'],
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, 403)


class AdminDashboardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com',
            username='admin@example.com',
            password='testpass123',
            role='admin',
            phone='1234567890',
            location='Mumbai'
        )
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='testpass123',
            role='user',
            phone='1234567890',
            location='Mumbai'
        )
        refresh = RefreshToken.for_user(self.admin)
        self.admin_token = str(refresh.access_token)
        refresh = RefreshToken.for_user(self.user)
        self.user_token = str(refresh.access_token)

    def test_admin_can_access_dashboard(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
        response = self.client.get('/api/user/admin-dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('stats', response.data)
        self.assertEqual(response.data['stats']['total_users'], 2)
        self.assertIn('users', response.data)
        self.assertIn('bookings', response.data)
        self.assertIn('boxes', response.data)
        self.assertIn('revenue_chart', response.data)
        self.assertIn('user_growth_chart', response.data)
        self.assertIn('sports_distribution', response.data)
        self.assertIn('top_cities', response.data)
        self.assertIn('recent_activity', response.data)

    def test_non_admin_cannot_access_dashboard(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.user_token}')
        response = self.client.get('/api/user/admin-dashboard/')
        self.assertEqual(response.status_code, 403)
