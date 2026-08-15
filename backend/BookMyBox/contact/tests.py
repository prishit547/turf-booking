# contact/tests.py
from unittest.mock import patch

from django.conf import settings
from rest_framework.test import APITestCase

from .models import ContactSubmission


class ContactSubmissionTests(APITestCase):
    url = '/api/contact/'

    def valid_payload(self, **overrides):
        payload = {
            'name': 'Jane Doe',
            'email': 'jane@example.com',
            'phone': '9876543210',
            'subject': 'Question about booking',
            'message': 'Hi, I had a question about my recent booking.',
            'inquiry_type': 'booking',
        }
        payload.update(overrides)
        return payload

    @patch('contact.views.send_email_task.delay')
    def test_valid_submission_creates_record_and_queues_email(self, mock_delay):
        response = self.client.post(self.url, self.valid_payload(), format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(ContactSubmission.objects.count(), 1)

        submission = ContactSubmission.objects.get()
        self.assertEqual(submission.name, 'Jane Doe')
        self.assertEqual(submission.email, 'jane@example.com')
        self.assertEqual(submission.subject, 'Question about booking')

        mock_delay.assert_called_once()
        call_args = mock_delay.call_args[0]
        self.assertEqual(call_args[0], settings.SUPPORT_EMAIL)
        self.assertIn('Question about booking', call_args[1])
        self.assertIn('jane@example.com', call_args[2])
        self.assertIn('Jane Doe', call_args[2])

    @patch('contact.views.send_email_task.delay')
    def test_missing_required_fields_returns_400_and_does_not_send(self, mock_delay):
        response = self.client.post(self.url, {
            'name': '',
            'email': 'not-an-email',
            'subject': '',
            'message': '',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.data)
        self.assertIn('email', response.data)
        self.assertIn('subject', response.data)
        self.assertIn('message', response.data)
        self.assertEqual(ContactSubmission.objects.count(), 0)
        mock_delay.assert_not_called()

    @patch('contact.views.send_email_task.delay')
    def test_whitespace_only_fields_are_rejected(self, mock_delay):
        response = self.client.post(self.url, self.valid_payload(name='   ', subject='  ', message='   '), format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ContactSubmission.objects.count(), 0)
        mock_delay.assert_not_called()

    @patch('contact.views.send_email_task.delay')
    def test_phone_and_inquiry_type_are_optional(self, mock_delay):
        payload = self.valid_payload()
        del payload['phone']
        del payload['inquiry_type']

        response = self.client.post(self.url, payload, format='json')

        self.assertEqual(response.status_code, 201)
        submission = ContactSubmission.objects.get()
        self.assertEqual(submission.phone, '')
        self.assertEqual(submission.inquiry_type, 'general')
        mock_delay.assert_called_once()
