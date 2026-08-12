from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking, BookingInvite

User = get_user_model()


class BookingInviteTests(APITestCase):
    def setUp(self):
        self.booker = User.objects.create_user(
            email='booker@example.com', username='booker@example.com', password='testpass123', role='user',
        )
        self.invitee = User.objects.create_user(
            email='invitee@example.com', username='invitee@example.com', password='testpass123', role='user',
        )
        self.stranger = User.objects.create_user(
            email='stranger@example.com', username='stranger@example.com', password='testpass123', role='user',
        )
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com', password='testpass123', role='owner',
        )
        self.box = Box.objects.create(
            name='Test Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.booking = Booking.objects.create(
            user=self.booker, box=self.box, date='2030-01-15', start_time='10:00', end_time='11:00',
            duration=1, total_amount=500,
        )
        self.booker_token = str(RefreshToken.for_user(self.booker).access_token)
        self.invitee_token = str(RefreshToken.for_user(self.invitee).access_token)
        self.stranger_token = str(RefreshToken.for_user(self.stranger).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    @patch('bookings.views.send_email_task.delay')
    def test_booker_can_invite_existing_user_by_email(self, mock_delay):
        self._auth(self.booker_token)
        response = self.client.post(
            f'/api/bookings/{self.booking.id}/invite/', {'invited_email': 'invitee@example.com'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        invite = BookingInvite.objects.get(booking=self.booking)
        self.assertEqual(invite.invited_user, self.invitee)
        self.assertEqual(invite.status, 'pending')
        mock_delay.assert_called_once()

    @patch('bookings.views.send_email_task.delay')
    def test_booker_can_invite_by_raw_email_with_no_account(self, mock_delay):
        self._auth(self.booker_token)
        response = self.client.post(
            f'/api/bookings/{self.booking.id}/invite/', {'invited_email': 'nobody@example.com'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        invite = BookingInvite.objects.get(booking=self.booking)
        self.assertIsNone(invite.invited_user)
        self.assertEqual(invite.invited_email, 'nobody@example.com')

    @patch('bookings.views.send_email_task.delay')
    def test_non_booker_cannot_invite(self, mock_delay):
        # A stranger isn't the booker or an accepted participant, so
        # get_queryset() doesn't even surface this booking to them —
        # 404, not 403, matching this app's established convention
        # elsewhere (a mismatched id 404s rather than leaking existence).
        self._auth(self.stranger_token)
        response = self.client.post(
            f'/api/bookings/{self.booking.id}/invite/', {'invited_email': 'invitee@example.com'}, format='json',
        )
        self.assertEqual(response.status_code, 404)

    @patch('bookings.views.send_email_task.delay')
    def test_cannot_invite_self(self, mock_delay):
        self._auth(self.booker_token)
        response = self.client.post(
            f'/api/bookings/{self.booking.id}/invite/', {'invited_email': 'booker@example.com'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    @patch('bookings.views.send_email_task.delay')
    def test_accepted_participant_cannot_invite_others(self, mock_delay):
        # A participant CAN see the booking (via the broadened queryset),
        # so this is the one path that actually reaches the explicit
        # booker-only check inside `invite` itself, unlike a stranger
        # (who 404s earlier, in get_object()).
        invite = BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_user=self.invitee,
            invited_email='invitee@example.com', expires_at=timezone.now() + timedelta(days=7),
        )
        self._auth(self.invitee_token)
        self.client.post(f'/api/bookings/invites/{invite.token}/accept/')

        response = self.client.post(
            f'/api/bookings/{self.booking.id}/invite/', {'invited_email': 'stranger@example.com'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_invite_detail_is_public(self):
        invite = BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_email='invitee@example.com',
            expires_at=timezone.now() + timedelta(days=7),
        )
        response = self.client.get(f'/api/bookings/invites/{invite.token}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['valid'])
        self.assertEqual(response.data['box_name'], 'Test Box')

    def test_accept_invite_grants_visibility_but_not_cancel_rights(self):
        invite = BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_user=self.invitee,
            invited_email='invitee@example.com',
            expires_at=timezone.now() + timedelta(days=7),
        )
        self._auth(self.invitee_token)
        response = self.client.post(f'/api/bookings/invites/{invite.token}/accept/')
        self.assertEqual(response.status_code, 200)

        # Now visible in the invitee's own booking list/detail...
        detail = self.client.get(f'/api/bookings/{self.booking.id}/')
        self.assertEqual(detail.status_code, 200)

        # ...but cancel stays booker-only.
        cancel = self.client.post(f'/api/bookings/{self.booking.id}/cancel/', {'reason': 'test'}, format='json')
        self.assertEqual(cancel.status_code, 403)

    def test_pending_invite_does_not_grant_visibility(self):
        BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_user=self.invitee,
            invited_email='invitee@example.com',
            expires_at=timezone.now() + timedelta(days=7),
        )
        self._auth(self.invitee_token)
        response = self.client.get(f'/api/bookings/{self.booking.id}/')
        self.assertEqual(response.status_code, 404)

    def test_decline_invite(self):
        invite = BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_user=self.invitee,
            invited_email='invitee@example.com',
            expires_at=timezone.now() + timedelta(days=7),
        )
        self._auth(self.invitee_token)
        response = self.client.post(f'/api/bookings/invites/{invite.token}/decline/')
        self.assertEqual(response.status_code, 200)
        invite.refresh_from_db()
        self.assertEqual(invite.status, 'declined')

        # A declined invite no longer grants visibility.
        detail = self.client.get(f'/api/bookings/{self.booking.id}/')
        self.assertEqual(detail.status_code, 404)

    def test_expired_invite_cannot_be_accepted(self):
        invite = BookingInvite.objects.create(
            booking=self.booking, invited_by=self.booker, invited_user=self.invitee,
            invited_email='invitee@example.com',
            expires_at=timezone.now() - timedelta(days=1),
        )
        self._auth(self.invitee_token)
        response = self.client.post(f'/api/bookings/invites/{invite.token}/accept/')
        self.assertEqual(response.status_code, 409)


class UserSearchTests(APITestCase):
    def setUp(self):
        self.searcher = User.objects.create_user(
            email='searcher@example.com', username='searcher@example.com', password='testpass123', role='user',
        )
        self.match = User.objects.create_user(
            email='findme@example.com', username='findme@example.com', password='testpass123', role='user',
            first_name='Findable',
        )
        self.token = str(RefreshToken.for_user(self.searcher).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_search_by_email(self):
        response = self.client.get('/api/user/search/?q=findme')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['email'], 'findme@example.com')

    def test_search_excludes_self(self):
        response = self.client.get('/api/user/search/?q=searcher')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_short_query_returns_empty(self):
        response = self.client.get('/api/user/search/?q=f')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)
