# boxes/tests.py

from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from PIL import Image

from boxes.models import Box

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
