# BookMyBox/tests_sitemap.py
from django.test import TestCase, override_settings
from django.urls import reverse
from boxes.models import Box
from django.contrib.auth import get_user_model

User = get_user_model()


class SitemapAndRobotsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@boxnplay.com',
            username='owner@boxnplay.com',
            role='owner',
        )
        self.box1 = Box.objects.create(
            name='Ahmedabad Super Turf',
            sport='Cricket',
            location='Ahmedabad',
            price=1200,
            status='approved',
            owner=self.owner,
        )
        self.box2 = Box.objects.create(
            name='Pending Turf Arena',
            sport='Football',
            location='Ahmedabad',
            price=1000,
            status='pending',
            owner=self.owner,
        )

    @override_settings(FRONTEND_URL='https://boxnplay.com')
    def test_sitemap_xml_renders_correctly(self):
        response = self.client.get('/sitemap.xml')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/xml')

        content = response.content.decode('utf-8')
        # Validate XML root & namespace
        self.assertIn('<?xml version="1.0" encoding="UTF-8"?>', content)
        self.assertIn('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"', content)

        # Validate Static Pages
        self.assertIn('<loc>https://boxnplay.com/</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/boxes</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/about</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/contact</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/terms</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/privacy</loc>', content)
        self.assertIn('<loc>https://boxnplay.com/cancellation-policy</loc>', content)

        # Validate changefreq and priority
        self.assertIn('<changefreq>daily</changefreq>', content)
        self.assertIn('<priority>1.0</priority>', content)

        # Validate Approved Box inclusion
        self.assertIn(f'<loc>https://boxnplay.com/boxes/{self.box1.id}</loc>', content)

        # Validate Pending Box is NOT included
        self.assertNotIn(f'<loc>https://boxnplay.com/boxes/{self.box2.id}</loc>', content)

    @override_settings(FRONTEND_URL='https://boxnplay.com')
    def test_api_sitemap_xml_alias(self):
        response = self.client.get('/api/sitemap.xml')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/xml')
        content = response.content.decode('utf-8')
        self.assertIn('<loc>https://boxnplay.com/</loc>', content)

    @override_settings(FRONTEND_URL='https://boxnplay.com')
    def test_robots_txt_renders_correctly(self):
        response = self.client.get('/robots.txt')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/plain')
        content = response.content.decode('utf-8')
        self.assertIn('User-agent: *', content)
        self.assertIn('Allow: /', content)
        self.assertIn('Allow: /boxes', content)
        self.assertIn('Disallow: /admin-dashboard/', content)
        self.assertIn('Disallow: /owner-dashboard/', content)
        self.assertIn('Disallow: /user-dashboard/', content)
        self.assertIn('Disallow: /checkout', content)
        self.assertIn('Sitemap: https://boxnplay.com/sitemap.xml', content)
