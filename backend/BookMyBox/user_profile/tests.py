from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from user_profile.models import UserProfile

User = get_user_model()


class UserProfileAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        self.other_user = User.objects.create_user(
            email='other@example.com', username='other@example.com', password='testpass123',
            role='user', phone='1234567891', location='Mumbai',
        )
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        response = self.client.get('/api/user_profile/my-profile/')
        self.assertEqual(response.status_code, 401)

    def test_profile_is_created_automatically_by_signal(self):
        # The post_save signal on User creates a UserProfile immediately,
        # before any view/serializer get_or_create ever runs.
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_get_my_profile(self):
        response = self.client.get('/api/user_profile/my-profile/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'player@example.com')
        self.assertEqual(response.data['preferred_sports'], [])

    def test_update_my_profile(self):
        response = self.client.patch(
            '/api/user_profile/my-profile/update/',
            {'bio': 'I love cricket', 'preferred_sports': ['Cricket', 'Football']},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['bio'], 'I love cricket')
        self.assertEqual(response.data['preferred_sports'], ['Cricket', 'Football'])

        self.user.refresh_from_db()
        self.assertEqual(self.user.profile.bio, 'I love cricket')

    def test_update_rejects_phone_over_max_length(self):
        response = self.client.patch(
            '/api/user_profile/my-profile/update/',
            {'phone': '12345678901'},  # 11 digits, max_length=10
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_partial_update_only_touches_provided_fields(self):
        self.client.patch('/api/user_profile/my-profile/update/', {'bio': 'first'}, format='json')
        response = self.client.patch(
            '/api/user_profile/my-profile/update/', {'first_name': 'Alex'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['first_name'], 'Alex')
        self.assertEqual(response.data['bio'], 'first')  # untouched by the second request

    def test_retrieve_own_profile_by_pk(self):
        response = self.client.get(f'/api/user_profile/{self.user.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'player@example.com')

    def test_retrieve_someone_elses_profile_forbidden(self):
        response = self.client.get(f'/api/user_profile/{self.other_user.id}/')
        self.assertEqual(response.status_code, 403)

    def test_update_someone_elses_profile_forbidden(self):
        response = self.client.patch(
            f'/api/user_profile/{self.other_user.id}/', {'bio': 'hijacked'}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        self.other_user.refresh_from_db()
        self.assertNotEqual(self.other_user.profile.bio, 'hijacked')
