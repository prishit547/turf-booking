from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from chatbot.models import ChatConversation, ChatMessage
from chatbot.views import _get_rate_limit_key

User = get_user_model()

URL = '/api/chatbot/'


class ChatbotAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='player@example.com', username='player@example.com', password='testpass123',
            role='user', phone='1234567890', location='Mumbai',
        )
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def tearDown(self):
        cache.clear()

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        response = self.client.post(URL, {'message': 'hello'}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_get_not_allowed(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 405)

    def test_empty_message_rejected(self):
        response = self.client.post(URL, {'message': '   '}, format='json')
        self.assertEqual(response.status_code, 400)

    @patch('chatbot.views.genai.GenerativeModel')
    def test_successful_response_is_saved_and_returned(self, mock_model_cls):
        mock_model_cls.return_value.generate_content.return_value = MagicMock(text='Hello from bot')

        response = self.client.post(URL, {'message': 'How do I book a turf?'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'success')
        self.assertEqual(response.data['response'], 'Hello from bot')
        self.assertIn('session_id', response.data)

        conversation = ChatConversation.objects.get(session_id=response.data['session_id'])
        self.assertEqual(conversation.user, self.user)
        messages = list(ChatMessage.objects.filter(conversation=conversation).order_by('timestamp'))
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0].message_type, 'user')
        self.assertEqual(messages[0].content, 'How do I book a turf?')
        self.assertEqual(messages[1].message_type, 'bot')
        self.assertEqual(messages[1].content, 'Hello from bot')

    @patch('chatbot.views.genai.GenerativeModel')
    def test_gemini_failure_returns_200_with_error_status(self, mock_model_cls):
        mock_model_cls.return_value.generate_content.side_effect = Exception('Gemini is down')

        response = self.client.post(URL, {'message': 'How do I book a turf?'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'error')
        self.assertIn('technical difficulties', response.data['response'])

        # the user's message is still persisted even though the bot's isn't;
        # session_id isn't echoed back on this error path, so look the
        # conversation up via the user instead
        conversation = ChatConversation.objects.get(user=self.user)
        self.assertEqual(ChatMessage.objects.filter(conversation=conversation, message_type='user').count(), 1)
        self.assertEqual(ChatMessage.objects.filter(conversation=conversation, message_type='bot').count(), 0)

    @override_settings(GEMINI_API_KEY='')
    def test_missing_api_key_returns_200_with_friendly_error(self):
        response = self.client.post(URL, {'message': 'How do I book a turf?'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'error')
        self.assertIn('not properly configured', response.data['response'])
        # no conversation should be created — the check happens before that
        self.assertFalse(ChatConversation.objects.filter(user=self.user).exists())

    @patch('chatbot.views.genai.GenerativeModel')
    def test_reusing_a_session_id_continues_the_same_conversation(self, mock_model_cls):
        mock_model_cls.return_value.generate_content.return_value = MagicMock(text='reply')

        first = self.client.post(URL, {'message': 'first', 'session_id': 'fixed-session'}, format='json')
        second = self.client.post(URL, {'message': 'second', 'session_id': 'fixed-session'}, format='json')

        self.assertEqual(ChatConversation.objects.filter(session_id='fixed-session').count(), 1)
        conversation = ChatConversation.objects.get(session_id='fixed-session')
        self.assertEqual(ChatMessage.objects.filter(conversation=conversation).count(), 4)

    @patch('chatbot.views.genai.GenerativeModel')
    def test_rate_limit_blocks_after_20_requests_in_the_window(self, mock_model_cls):
        mock_model_cls.return_value.generate_content.return_value = MagicMock(text='reply')
        key = _get_rate_limit_key(self.user)
        cache.set(key, 20, timeout=60)  # simulate an already-exhausted limit

        response = self.client.post(URL, {'message': 'one more please'}, format='json')

        self.assertEqual(response.status_code, 429)
        self.assertIn('too quickly', response.data['response'])
        # blocked before ever reaching Gemini or persisting anything
        mock_model_cls.assert_not_called()
        self.assertFalse(ChatConversation.objects.filter(user=self.user).exists())

    @patch('chatbot.views.genai.GenerativeModel')
    def test_rate_limit_is_scoped_per_user(self, mock_model_cls):
        mock_model_cls.return_value.generate_content.return_value = MagicMock(text='reply')
        other_user = User.objects.create_user(
            email='other@example.com', username='other@example.com', password='testpass123',
            role='user', phone='1234567891', location='Mumbai',
        )
        cache.set(_get_rate_limit_key(self.user), 20, timeout=60)

        other_token = str(RefreshToken.for_user(other_user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {other_token}')
        response = self.client.post(URL, {'message': 'hello'}, format='json')

        self.assertEqual(response.status_code, 200)
