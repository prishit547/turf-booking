# bookings/tests/test_owner_booking_email.py
from datetime import date
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from bookings.email_services import (
    render_owner_booking_email_html,
    send_owner_booking_notification,
)

User = get_user_model()


class OwnerBookingEmailUnitTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@boxnplay.com',
            username='owner@boxnplay.com',
            first_name='Vikram',
            last_name='Patel',
            role='owner',
            phone='9825327612',
            business_name='Skyline Arena',
        )
        self.player = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            first_name='Rahul',
            last_name='Sharma',
            role='user',
            phone='9876543210',
        )
        self.box = Box.objects.create(
            name='Skyline Turf Arena',
            sport='Cricket',
            sports=['Cricket', 'Football'],
            location='Ahmedabad',
            price=1200,
            capacity=15,
            owner=self.owner,
            status='approved',
        )
        self.booking = Booking.objects.create(
            user=self.player,
            box=self.box,
            date=date(2026, 9, 10),
            start_time='18:00',
            end_time='20:00',
            duration=2,
            total_amount=2400,
            payment_status='Not Required',
            booking_status='Confirmed',
            booking_source='online',
        )

    def test_render_owner_booking_email_html_contains_all_details(self):
        html = render_owner_booking_email_html(self.booking)

        # Check Branding & Structure
        self.assertIn('BOX<span style="color: #ccff00;">N</span>PLAY', html)
        self.assertIn('Slot Booked!', html)
        self.assertIn('New Booking', html)

        # Check Owner Greeting
        self.assertIn('Vikram', html)

        # Check Venue Details
        self.assertIn('Skyline Turf Arena', html)
        self.assertIn('Cricket', html)
        self.assertIn(f'Booking #{self.booking.id}', html)
        self.assertIn('2026-09-10', html)
        self.assertIn('18:00 - 20:00 (2 hrs)', html)

        # Check Player / Customer Details
        self.assertIn('Rahul Sharma', html)
        self.assertIn('9876543210', html)
        self.assertIn('player@example.com', html)

        # Check Payment Details
        self.assertIn('₹2400', html)
        self.assertIn('Pay at Venue', html)

        # Check Support & CTA
        self.assertIn('Open Owner Dashboard', html)
        self.assertIn('+91 98253 27612', html)
        self.assertIn('Info@boxnplay.com', html)

    @patch('bookings.email_services.send_email_task.delay')
    def test_send_owner_booking_notification_dispatches_email_task(self, mock_delay):
        result = send_owner_booking_notification(self.booking)

        self.assertTrue(result)
        mock_delay.assert_called_once()
        args, kwargs = mock_delay.call_args
        recipient, subject, html = args

        self.assertEqual(recipient, 'owner@boxnplay.com')
        self.assertIn('Skyline Turf Arena', subject)
        self.assertIn('2026-09-10', subject)
        self.assertIn('18:00', subject)
        self.assertIn('Skyline Turf Arena', html)

    @patch('bookings.email_services.send_email_task.delay')
    def test_send_owner_booking_notification_handles_missing_owner(self, mock_delay):
        box_no_owner = Box.objects.create(
            name='Orphan Box',
            sport='Cricket',
            price=500,
            owner=None,
            status='approved',
        )
        booking = Booking.objects.create(
            user=self.player,
            box=box_no_owner,
            date=date(2026, 9, 10),
            start_time='10:00',
            end_time='11:00',
            duration=1,
            total_amount=500,
        )

        result = send_owner_booking_notification(booking)
        self.assertFalse(result)
        mock_delay.assert_not_called()

    @patch('bookings.email_services.send_email_task.delay', side_effect=Exception('Redis connection error'))
    def test_send_owner_booking_notification_catches_celery_errors(self, mock_delay):
        result = send_owner_booking_notification(self.booking)
        self.assertFalse(result)


class OwnerBookingEmailAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='turfowner@example.com',
            username='turfowner@example.com',
            role='owner',
            first_name='Karan',
            business_name='Karan Sports',
        )
        self.player = User.objects.create_user(
            email='customer@example.com',
            username='customer@example.com',
            role='user',
            first_name='Ankit',
            phone='9811122233',
        )
        self.box = Box.objects.create(
            name='Karan Cricket Ground',
            sport='Cricket',
            sports=['Cricket'],
            location='Ahmedabad',
            price=1000,
            capacity=22,
            owner=self.owner,
            status='approved',
        )
        token = RefreshToken.for_user(self.player)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token.access_token)}')

    @patch('bookings.views.send_owner_booking_notification')
    def test_create_booking_triggers_owner_email(self, mock_send_email):
        response = self.client.post(
            '/api/bookings/',
            {
                'boxId': self.box.id,
                'date': '2030-05-10',
                'startTime': '16:00',
                'duration': 2,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        mock_send_email.assert_called_once()
        booking_arg = mock_send_email.call_args[0][0]
        self.assertEqual(booking_arg.box, self.box)
        self.assertEqual(booking_arg.user, self.player)

    @patch('bookings.views.send_owner_booking_notification')
    def test_recurring_booking_triggers_owner_email(self, mock_send_email):
        response = self.client.post(
            '/api/bookings/recurring/',
            {
                'boxId': self.box.id,
                'date': '2030-06-01',
                'startTime': '17:00',
                'duration': 1,
                'weeks': 3,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        mock_send_email.assert_called_once()
