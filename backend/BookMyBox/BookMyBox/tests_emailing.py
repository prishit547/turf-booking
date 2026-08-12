from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from . import emailing


class SendEmailTests(TestCase):
    @override_settings(RESEND_API_KEY='')
    def test_returns_false_when_no_api_key_configured(self):
        with patch('BookMyBox.emailing.requests.post') as mock_post:
            result = emailing.send_email('someone@example.com', 'Subject', '<p>Hi</p>')
        self.assertFalse(result)
        mock_post.assert_not_called()

    @override_settings(RESEND_API_KEY='test-key', DEFAULT_FROM_EMAIL='from@example.com')
    def test_sends_via_resend_and_returns_true_on_success(self):
        mock_response = MagicMock(status_code=200)
        mock_response.raise_for_status.return_value = None
        with patch('BookMyBox.emailing.requests.post', return_value=mock_response) as mock_post:
            result = emailing.send_email('someone@example.com', 'Subject', '<p>Hi</p>')

        self.assertTrue(result)
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs['headers']['Authorization'], 'Bearer test-key')
        self.assertEqual(kwargs['json']['from'], 'from@example.com')
        self.assertEqual(kwargs['json']['to'], ['someone@example.com'])
        self.assertEqual(kwargs['json']['subject'], 'Subject')

    @override_settings(RESEND_API_KEY='test-key')
    def test_raises_on_http_failure(self):
        mock_response = MagicMock(status_code=500)
        import requests
        mock_response.raise_for_status.side_effect = requests.HTTPError('boom')
        with patch('BookMyBox.emailing.requests.post', return_value=mock_response):
            with self.assertRaises(requests.HTTPError):
                emailing.send_email('someone@example.com', 'Subject', '<p>Hi</p>')
