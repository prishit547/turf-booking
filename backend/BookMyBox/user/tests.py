from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from bookings.models import Booking
from boxes.models import Box, CommissionRate, Review
from owner_dashboard.models import Payout

from .models import AdminActionLog, OwnerPayoutDetails, OwnerVerification, PasswordResetToken
from user_profile.models import UserProfile

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


class PasswordResetTests(APITestCase):
    def setUp(self):
        # These endpoints now carry the 'password_reset' ScopedRateThrottle
        # (3/min, see settings.py) — clear the cache-backed counter so a
        # prior test class/run (throttle state lives in Redis, outside the
        # per-test DB transaction rollback) can't leave this class starting
        # already throttled.
        cache.clear()
        self.user = User.objects.create_user(
            email='player@example.com',
            username='player@example.com',
            password='oldpass123',
            role='user',
        )

    def tearDown(self):
        cache.clear()

    @patch('user.views.send_email_task.delay')
    def test_request_reset_creates_token_and_queues_email_for_known_user(self, mock_delay):
        response = self.client.post('/api/user/password-reset/', {'email': 'player@example.com'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used_at__isnull=True).count(), 1)
        mock_delay.assert_called_once()

    @patch('user.views.send_email_task.delay')
    def test_request_reset_is_silent_no_op_for_unknown_email(self, mock_delay):
        response = self.client.post('/api/user/password-reset/', {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 0)
        mock_delay.assert_not_called()

    @patch('user.views.send_email_task.delay')
    def test_requesting_again_invalidates_prior_token(self, mock_delay):
        self.client.post('/api/user/password-reset/', {'email': 'player@example.com'}, format='json')
        first_token = PasswordResetToken.objects.get(user=self.user)
        self.client.post('/api/user/password-reset/', {'email': 'player@example.com'}, format='json')
        first_token.refresh_from_db()
        self.assertIsNotNone(first_token.used_at)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used_at__isnull=True).count(), 1)

    def test_confirm_with_valid_token_changes_password(self):
        reset_token = PasswordResetToken.objects.create(
            user=self.user, expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )
        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': reset_token.token,
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('brandnewpass123'))
        reset_token.refresh_from_db()
        self.assertIsNotNone(reset_token.used_at)

    def test_confirm_rejects_expired_token(self):
        reset_token = PasswordResetToken.objects.create(
            user=self.user, expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': reset_token.token,
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('oldpass123'))

    def test_confirm_rejects_already_used_token(self):
        reset_token = PasswordResetToken.objects.create(
            user=self.user,
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
            used_at=timezone.now(),
        )
        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': reset_token.token,
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_confirm_rejects_mismatched_passwords(self):
        reset_token = PasswordResetToken.objects.create(
            user=self.user, expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )
        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': reset_token.token,
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'somethingelse456',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_confirm_rejects_unknown_token(self):
        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': 'not-a-real-token',
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)


class AdminUserEditTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com', username='admin@example.com',
            password='testpass123', role='admin',
        )
        self.target = User.objects.create_user(
            email='target@example.com', username='target@example.com',
            password='testpass123', role='user', first_name='Old', last_name='Name',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.admin).access_token}')

    def test_full_field_edit_persists_user_and_profile_fields(self):
        """A UserProfile row is normally auto-created by a post_save signal
        (see user_profile/signals.py::manage_user_profile) — but delete it
        here to simulate a legacy user without one, and confirm the
        admin-update serializer's get_or_create still handles that case
        rather than 404/500ing."""
        UserProfile.objects.filter(user=self.target).delete()
        self.assertFalse(UserProfile.objects.filter(user=self.target).exists())
        response = self.client.patch(f'/api/user/users/{self.target.id}/admin-update/', {
            'first_name': 'New', 'last_name': 'Person', 'phone': '9876543210',
            'business_name': 'Acme', 'location': 'Pune',
            'address': '123 Main St', 'date_of_birth': '1995-05-20', 'bio': 'Hello there',
            'role': 'owner', 'is_active': True,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, 'New')
        self.assertEqual(self.target.last_name, 'Person')
        self.assertEqual(self.target.phone, '9876543210')
        self.assertEqual(self.target.business_name, 'Acme')
        self.assertEqual(self.target.location, 'Pune')
        self.assertEqual(self.target.role, 'owner')

        profile = UserProfile.objects.get(user=self.target)
        self.assertEqual(profile.address, '123 Main St')
        self.assertEqual(str(profile.date_of_birth), '1995-05-20')
        self.assertEqual(profile.bio, 'Hello there')

    def test_unchanged_self_email_does_not_false_positive_on_uniqueness(self):
        """Re-saving a user with their own existing, unchanged email must
        not trip the email-uniqueness validator against themselves."""
        response = self.client.patch(f'/api/user/users/{self.target.id}/admin-update/', {
            'email': self.target.email, 'first_name': 'Touched',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, 'Touched')

    def test_email_uniqueness_still_enforced_against_other_user(self):
        other = User.objects.create_user(
            email='taken@example.com', username='taken@example.com', password='testpass123',
        )
        response = self.client.patch(f'/api/user/users/{self.target.id}/admin-update/', {
            'email': other.email,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_admin_cannot_edit_self(self):
        response = self.client.patch(f'/api/user/users/{self.admin.id}/admin-update/', {
            'role': 'user',
        }, format='json')
        self.assertEqual(response.status_code, 400)


class AdminCreateUserTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com', username='admin@example.com',
            password='testpass123', role='admin',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.admin).access_token}')

    def test_create_with_explicit_password_can_then_log_in(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'newbie@example.com', 'first_name': 'New', 'last_name': 'Bie',
            'phone': '9876543210', 'role': 'user', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        login = self.client.post('/api/user/login/', {
            'email': 'newbie@example.com', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(login.status_code, 200)

    @patch('user.views.send_email_task.delay')
    def test_create_without_password_sets_unusable_password_and_queues_reset_email(self, mock_delay):
        response = self.client.post('/api/user/users/create/', {
            'email': 'nopass@example.com', 'first_name': 'No', 'last_name': 'Pass',
            'phone': '9876543210', 'role': 'user',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        created = User.objects.get(email='nopass@example.com')
        self.assertFalse(created.has_usable_password())
        self.assertEqual(PasswordResetToken.objects.filter(user=created, used_at__isnull=True).count(), 1)
        mock_delay.assert_called_once()

    def test_admin_role_allowed_unlike_public_registration(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'newadmin@example.com', 'first_name': 'New', 'last_name': 'Admin',
            'phone': '9876543210', 'role': 'admin', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.get(email='newadmin@example.com').role, 'admin')

    def test_phone_is_required_for_any_admin_created_account(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'nophone@example.com', 'first_name': 'No', 'last_name': 'Phone',
            'role': 'user', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.data)

    def test_owner_missing_phone_is_rejected(self):
        # phone is a required serializer field, so a missing phone short-
        # circuits at field-level validation before the role-conditional
        # object-level validate() below even runs -- covered separately
        # from the other owner-only fields for that reason.
        response = self.client.post('/api/user/users/create/', {
            'email': 'baldowner@example.com', 'first_name': 'Bald', 'last_name': 'Owner',
            'role': 'owner', 'business_name': 'Bald Sports', 'location': 'Nowhere',
            'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.data)

    def test_owner_requires_name_business_name_and_location(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'baldowner2@example.com', 'phone': '9876543210',
            'role': 'owner', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        for field in ('first_name', 'last_name', 'business_name', 'location'):
            self.assertIn(field, response.data, response.data)

    def test_owner_with_all_required_fields_succeeds(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'realowner@example.com', 'first_name': 'Real', 'last_name': 'Owner',
            'phone': '9876543210', 'role': 'owner', 'business_name': 'Real Sports Arena',
            'location': 'Pune, Maharashtra', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        created = User.objects.get(email='realowner@example.com')
        self.assertEqual(created.business_name, 'Real Sports Arena')
        self.assertEqual(created.location, 'Pune, Maharashtra')

    def test_customer_created_by_admin_does_not_need_business_name(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'plaincustomer@example.com', 'first_name': 'Plain', 'last_name': 'Customer',
            'phone': '9876543210', 'role': 'user', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)


class AdminUserDeleteTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com', username='admin@example.com',
            password='testpass123', role='admin',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.admin).access_token}')

        self.customer = User.objects.create_user(
            email='customer@example.com', username='customer@example.com',
            password='testpass123', role='user',
        )
        self.owner = User.objects.create_user(
            email='owner@example.com', username='owner@example.com',
            password='testpass123', role='owner', business_name='Acme Turfs',
        )
        self.box = Box.objects.create(
            name='Owner Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.booking = Booking.objects.create(
            user=self.customer, box=self.box, date='2030-01-15',
            start_time='10:00', end_time='12:00', duration=2, total_amount=1000,
        )
        Review.objects.create(box=self.box, user=self.customer, rating=5, comment='Great!')
        Payout.objects.create(owner=self.owner, amount=500)
        CommissionRate.objects.create(owner=self.owner, sport='Cricket', rate=10)

    def test_delete_preview_counts_for_plain_customer(self):
        response = self.client.get(f'/api/user/users/{self.customer.id}/delete-preview/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['bookings_as_customer'], 1)
        self.assertEqual(response.data['reviews'], 1)
        self.assertNotIn('boxes_owned', response.data)

    def test_delete_preview_counts_for_owner(self):
        response = self.client.get(f'/api/user/users/{self.owner.id}/delete-preview/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['boxes_owned'], 1)
        self.assertEqual(response.data['payout_records'], 1)
        self.assertEqual(response.data['payout_total_amount'], 500.0)
        self.assertEqual(response.data['commission_rate_overrides'], 1)

    def test_delete_customer_cascades_bookings_and_reviews(self):
        response = self.client.delete(f'/api/user/users/{self.customer.id}/delete/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=self.customer.id).exists())
        self.assertFalse(Booking.objects.filter(id=self.booking.id).exists())
        self.assertEqual(Review.objects.filter(user_id=self.customer.id).count(), 0)

    def test_delete_owner_makes_box_ownerless_not_deleted(self):
        response = self.client.delete(f'/api/user/users/{self.owner.id}/delete/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=self.owner.id).exists())

        self.box.refresh_from_db()
        self.assertIsNone(self.box.owner_id)
        self.assertEqual(self.box.status, 'approved')

        self.assertEqual(Payout.objects.count(), 0)
        self.assertEqual(CommissionRate.objects.count(), 0)

    def test_admin_cannot_delete_self(self):
        response = self.client.delete(f'/api/user/users/{self.admin.id}/delete/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())

        preview = self.client.get(f'/api/user/users/{self.admin.id}/delete-preview/')
        self.assertEqual(preview.status_code, 400)


class AdminActionLogTests(APITestCase):
    """Confirms AdminActionLog rows actually get written (queryable in the
    DB, not just a logger.info() console line) for the three existing
    admin user-management views, and that the read endpoint behind the new
    Activity Log tab works. See user/audit.py::log_admin_action()."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-audit@example.com', username='admin-audit@example.com',
            password='testpass123', role='admin',
        )
        self.non_admin = User.objects.create_user(
            email='plain-audit@example.com', username='plain-audit@example.com',
            password='testpass123', role='user',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.admin).access_token}')

    def test_update_writes_audit_log_with_changed_fields(self):
        target = User.objects.create_user(
            email='update-target@example.com', username='update-target@example.com',
            password='testpass123', role='user', first_name='Old',
        )
        response = self.client.patch(f'/api/user/users/{target.id}/admin-update/', {
            'first_name': 'New', 'is_active': False,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        log = AdminActionLog.objects.filter(action='user.update', target_id=str(target.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.target_type, 'User')
        self.assertEqual(log.target_repr, target.email)
        changed = log.details['changed']
        self.assertEqual(changed['first_name'], {'before': 'Old', 'after': 'New'})
        self.assertEqual(changed['is_active'], {'before': True, 'after': False})
        self.assertNotIn('last_name', changed)  # unchanged fields aren't recorded

    def test_create_writes_audit_log(self):
        response = self.client.post('/api/user/users/create/', {
            'email': 'audit-created@example.com', 'first_name': 'Audit', 'last_name': 'Created',
            'phone': '9876543210', 'role': 'owner', 'business_name': 'Audit Created Sports',
            'location': 'Delhi, India', 'password': 'explicitpass123',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        created = User.objects.get(email='audit-created@example.com')

        log = AdminActionLog.objects.filter(action='user.create', target_id=str(created.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.target_repr, 'audit-created@example.com')
        self.assertEqual(log.details['role'], 'owner')
        self.assertTrue(log.details['password_set'])

    def test_delete_writes_audit_log_with_preview_counts(self):
        target = User.objects.create_user(
            email='delete-target@example.com', username='delete-target@example.com',
            password='testpass123', role='user',
        )
        target_id = target.id
        response = self.client.delete(f'/api/user/users/{target_id}/delete/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=target_id).exists())

        log = AdminActionLog.objects.filter(action='user.delete', target_id=str(target_id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.target_type, 'User')
        self.assertEqual(log.target_repr, 'delete-target@example.com')
        self.assertIn('bookings_as_customer', log.details)

    def test_action_log_endpoint_lists_newest_first_and_is_admin_only(self):
        target = User.objects.create_user(
            email='listed-target@example.com', username='listed-target@example.com',
            password='testpass123', role='user',
        )
        self.client.patch(f'/api/user/users/{target.id}/admin-update/', {'first_name': 'X'}, format='json')

        response = self.client.get('/api/user/admin/action-log/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['action'], 'user.update')

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.non_admin).access_token}')
        forbidden = self.client.get('/api/user/admin/action-log/')
        self.assertEqual(forbidden.status_code, 403)


class OwnerVerificationTests(APITestCase):
    """Full submit -> pending -> approve/reject lifecycle for the owner
    identity/business verification flow (mirrors boxes' Box approval
    pattern — see boxes/tests.py's equivalent AdminBoxViewSet tests).
    Central invariant under test: User.is_verified only ever flips True via
    an explicit admin approval, never as a side effect of submitting."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='verify-owner@example.com', username='verify-owner@example.com',
            password='testpass123', role='owner', business_name='Owner Turf',
        )
        self.other_owner = User.objects.create_user(
            email='other-owner@example.com', username='other-owner@example.com',
            password='testpass123', role='owner', business_name='Other Turf',
        )
        self.player = User.objects.create_user(
            email='verify-player@example.com', username='verify-player@example.com',
            password='testpass123', role='user',
        )
        self.admin = User.objects.create_user(
            email='verify-admin@example.com', username='verify-admin@example.com',
            password='testpass123', role='admin',
        )

    def _auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')

    def _doc(self, name='pan.pdf'):
        return SimpleUploadedFile(name, b'fake-document-bytes', content_type='application/pdf')

    # --- Owner-facing GET/POST ---

    def test_get_lazily_creates_not_submitted_record_for_current_owner_only(self):
        self._auth(self.owner)
        response = self.client.get('/api/user/owner/verification/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['verification_status'], 'not_submitted')
        self.assertEqual(OwnerVerification.objects.filter(user=self.owner).count(), 1)
        # Never touches another owner's row.
        self.assertFalse(OwnerVerification.objects.filter(user=self.other_owner).exists())

    def test_non_owner_cannot_reach_owner_verification_endpoint(self):
        self._auth(self.player)
        response = self.client.get('/api/user/owner/verification/')
        self.assertEqual(response.status_code, 403)

    def test_submit_without_document_is_rejected(self):
        self._auth(self.owner)
        response = self.client.post(
            '/api/user/owner/verification/', {'pan_number': 'ABCDE1234F'}, format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_verified)

    def test_submit_with_document_moves_to_pending_and_does_not_auto_verify(self):
        self._auth(self.owner)
        response = self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F',
            'gst_number': '22ABCDE1234F1Z5',
            'verification_document': self._doc(),
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['verification_status'], 'pending')
        self.assertIsNotNone(response.data['submitted_at'])

        verification = OwnerVerification.objects.get(user=self.owner)
        self.assertEqual(verification.verification_status, 'pending')
        self.assertEqual(verification.pan_number, 'ABCDE1234F')

        # Submitting is never, by itself, enough to flip is_verified.
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_verified)

    def test_cannot_resubmit_while_pending(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        second = self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ZZZZZ9999Z', 'verification_document': self._doc('second.pdf'),
        }, format='multipart')
        self.assertEqual(second.status_code, 400)

    # --- Admin review: approve ---

    def test_admin_approve_sets_is_verified_and_review_metadata(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.admin)
        response = self.client.post(f'/api/user/admin/verifications/{verification.id}/approve/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['verification_status'], 'approved')

        verification.refresh_from_db()
        self.assertEqual(verification.verification_status, 'approved')
        self.assertEqual(verification.reviewed_by, self.admin)
        self.assertIsNotNone(verification.reviewed_at)

        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_verified)

    # --- Admin review: reject ---

    def test_admin_reject_requires_reason_and_leaves_is_verified_false(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.admin)
        no_reason = self.client.post(f'/api/user/admin/verifications/{verification.id}/reject/')
        self.assertEqual(no_reason.status_code, 400)

        response = self.client.post(
            f'/api/user/admin/verifications/{verification.id}/reject/',
            {'reason': 'Document is unreadable'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['verification_status'], 'rejected')
        self.assertEqual(response.data['rejection_reason'], 'Document is unreadable')

        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_verified)

    def test_owner_can_resubmit_after_rejection(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.admin)
        self.client.post(
            f'/api/user/admin/verifications/{verification.id}/reject/',
            {'reason': 'Blurry scan'}, format='json',
        )

        self._auth(self.owner)
        resubmit = self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc('retry.pdf'),
        }, format='multipart')
        self.assertEqual(resubmit.status_code, 201)
        self.assertEqual(resubmit.data['verification_status'], 'pending')
        self.assertEqual(resubmit.data['rejection_reason'], '')

    # --- Access control: only admins can approve/reject, never the owner themselves ---

    def test_owner_cannot_approve_their_own_verification(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        # Still authenticated as the owner (not the admin) here.
        response = self.client.post(f'/api/user/admin/verifications/{verification.id}/approve/')
        self.assertEqual(response.status_code, 403)

        verification.refresh_from_db()
        self.assertEqual(verification.verification_status, 'pending')
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_verified)

    def test_other_owner_cannot_approve_or_reject_someone_elses_verification(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.other_owner)
        approve = self.client.post(f'/api/user/admin/verifications/{verification.id}/approve/')
        self.assertEqual(approve.status_code, 403)
        reject = self.client.post(
            f'/api/user/admin/verifications/{verification.id}/reject/', {'reason': 'no'}, format='json',
        )
        self.assertEqual(reject.status_code, 403)

    def test_regular_player_cannot_approve_or_reject(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.player)
        approve = self.client.post(f'/api/user/admin/verifications/{verification.id}/approve/')
        self.assertEqual(approve.status_code, 403)

    # --- Admin list_pending ---

    def test_list_pending_only_returns_pending_and_is_admin_only(self):
        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')

        self._auth(self.other_owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ZZZZZ9999Z', 'verification_document': self._doc('other.pdf'),
        }, format='multipart')
        other_verification = OwnerVerification.objects.get(user=self.other_owner)

        self._auth(self.admin)
        # Approve one of the two — it should drop out of the pending queue.
        self.client.post(f'/api/user/admin/verifications/{other_verification.id}/approve/')

        response = self.client.get('/api/user/admin/verifications/pending/')
        self.assertEqual(response.status_code, 200)
        emails = [row['owner_email'] for row in response.data['results']]
        self.assertIn(self.owner.email, emails)
        self.assertNotIn(self.other_owner.email, emails)

        self._auth(self.player)
        forbidden = self.client.get('/api/user/admin/verifications/pending/')
        self.assertEqual(forbidden.status_code, 403)

    # --- boxes/AdminBoxSerializer surfaces this status for the Box Approvals badge ---

    def test_box_admin_pending_serializer_surfaces_owner_verification_status(self):
        box = Box.objects.create(
            name='Verify Test Box', sport='Football', location='Pune', price=500,
            owner=self.owner, status='pending',
        )
        self._auth(self.admin)
        before = self.client.get('/api/boxes/admin/pending/')
        row = next(r for r in before.data['results'] if r['id'] == box.id)
        self.assertEqual(row['owner_verification_status'], 'not_submitted')

        self._auth(self.owner)
        self.client.post('/api/user/owner/verification/', {
            'pan_number': 'ABCDE1234F', 'verification_document': self._doc(),
        }, format='multipart')
        verification = OwnerVerification.objects.get(user=self.owner)

        self._auth(self.admin)
        self.client.post(f'/api/user/admin/verifications/{verification.id}/approve/')

        after = self.client.get('/api/boxes/admin/pending/')
        row = next(r for r in after.data['results'] if r['id'] == box.id)
        self.assertEqual(row['owner_verification_status'], 'approved')


class OwnerPayoutDetailsTests(APITestCase):
    """Owner-facing bank/UPI payout-destination record (see
    OwnerPayoutDetails' docstring) — lazily created on first GET, editable
    only by the owning owner, and surfaced read-only to admins via the
    payout balance endpoint (see owner_dashboard/tests.py's equivalent
    coverage of that side). Deliberately never a gate: every field is
    optional, so an empty row is a valid, non-error state."""

    def setUp(self):
        self.owner = User.objects.create_user(
            email='payout-details-owner@example.com', username='payout-details-owner@example.com',
            password='testpass123', role='owner', business_name='Owner Turf',
        )
        self.other_owner = User.objects.create_user(
            email='payout-details-other-owner@example.com', username='payout-details-other-owner@example.com',
            password='testpass123', role='owner', business_name='Other Turf',
        )
        self.player = User.objects.create_user(
            email='payout-details-player@example.com', username='payout-details-player@example.com',
            password='testpass123', role='user',
        )
        self.admin = User.objects.create_user(
            email='payout-details-admin@example.com', username='payout-details-admin@example.com',
            password='testpass123', role='admin',
        )

    def _auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')

    def test_get_lazily_creates_empty_record_for_current_owner_only(self):
        self._auth(self.owner)
        response = self.client.get('/api/user/owner/payout-details/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['bank_account_number'], '')
        self.assertEqual(response.data['upi_id'], '')
        self.assertEqual(OwnerPayoutDetails.objects.filter(owner=self.owner).count(), 1)
        self.assertFalse(OwnerPayoutDetails.objects.filter(owner=self.other_owner).exists())

    def test_non_owner_cannot_reach_endpoint(self):
        self._auth(self.player)
        response = self.client.get('/api/user/owner/payout-details/')
        self.assertEqual(response.status_code, 403)

        self._auth(self.admin)
        response = self.client.get('/api/user/owner/payout-details/')
        self.assertEqual(response.status_code, 403)

    def test_owner_can_patch_upi_only(self):
        self._auth(self.owner)
        response = self.client.patch('/api/user/owner/payout-details/', {'upi_id': 'owner@upi'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['upi_id'], 'owner@upi')
        details = OwnerPayoutDetails.objects.get(owner=self.owner)
        self.assertEqual(details.upi_id, 'owner@upi')
        self.assertEqual(details.bank_account_number, '')

    def test_owner_can_patch_bank_details_together(self):
        self._auth(self.owner)
        response = self.client.patch('/api/user/owner/payout-details/', {
            'account_holder_name': 'Owner Turf Pvt Ltd',
            'bank_account_number': '1234567890123',
            'ifsc_code': 'HDFC0001234',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        details = OwnerPayoutDetails.objects.get(owner=self.owner)
        self.assertEqual(details.bank_account_number, '1234567890123')
        self.assertEqual(details.ifsc_code, 'HDFC0001234')

    def test_bank_account_number_without_ifsc_is_rejected(self):
        self._auth(self.owner)
        response = self.client.patch(
            '/api/user/owner/payout-details/', {'bank_account_number': '1234567890123'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(OwnerPayoutDetails.objects.filter(owner=self.owner, bank_account_number__gt='').exists())

    def test_ifsc_without_bank_account_number_is_rejected(self):
        self._auth(self.owner)
        response = self.client.patch(
            '/api/user/owner/payout-details/', {'ifsc_code': 'HDFC0001234'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_fully_empty_patch_is_allowed(self):
        self._auth(self.owner)
        response = self.client.patch('/api/user/owner/payout-details/', {}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_owner_cannot_see_or_edit_another_owners_details(self):
        self._auth(self.other_owner)
        self.client.patch('/api/user/owner/payout-details/', {'upi_id': 'other@upi'}, format='json')

        self._auth(self.owner)
        response = self.client.get('/api/user/owner/payout-details/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['upi_id'], '')

        other_details = OwnerPayoutDetails.objects.get(owner=self.other_owner)
        self.assertEqual(other_details.upi_id, 'other@upi')

    def test_put_can_clear_a_previously_set_bank_pair(self):
        """PUT is a full replace — the frontend always sends all four fields
        (see OwnerPayoutDetailsCard.jsx), so explicit empty strings (not
        omitted keys, which every field's required=False would just skip)
        are how a real client clears a previously set pair."""
        self._auth(self.owner)
        self.client.patch('/api/user/owner/payout-details/', {
            'bank_account_number': '1234567890123', 'ifsc_code': 'HDFC0001234',
        }, format='json')
        response = self.client.put('/api/user/owner/payout-details/', {
            'account_holder_name': '', 'bank_account_number': '', 'ifsc_code': '', 'upi_id': '',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        details = OwnerPayoutDetails.objects.get(owner=self.owner)
        self.assertEqual(details.bank_account_number, '')
        self.assertEqual(details.ifsc_code, '')


# --- Auth endpoint rate limiting (ScopedRateThrottle, see settings.py's
# REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']) ---
#
# DRF's throttle counters are cache-backed (Redis here, see settings.py's
# CACHES), not DB-backed, so Django's normal per-test transaction rollback
# does nothing for them — a counter left behind by one test method would
# otherwise leak into and flake the next. Every class below clears the cache
# in both setUp and tearDown to keep each test's throttle window isolated.
class LoginThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='throttleme@example.com', username='throttleme@example.com',
            password='correctpass123', role='user',
        )

    def tearDown(self):
        cache.clear()

    def _attempt(self, password='wrongpass'):
        return self.client.post(
            '/api/user/login/', {'email': self.user.email, 'password': password}, format='json',
        )

    def test_sixth_attempt_within_the_window_is_throttled(self):
        # 'login' is rated 5/min -- the first 5 go through the normal
        # (failing, since the password is wrong) auth path.
        for _ in range(5):
            response = self._attempt()
            self.assertEqual(response.status_code, 400)
        throttled = self._attempt()
        self.assertEqual(throttled.status_code, 429)

    def test_throttle_applies_even_with_the_correct_password(self):
        # The point of throttling login is to stop credential-stuffing/brute
        # force -- it must not let a request past just because this
        # particular attempt happens to have the right password.
        for _ in range(5):
            self._attempt()
        throttled = self._attempt(password='correctpass123')
        self.assertEqual(throttled.status_code, 429)

    def test_window_reset_allows_requests_through_again(self):
        for _ in range(5):
            self._attempt()
        self.assertEqual(self._attempt().status_code, 429)
        # ScopedRateThrottle's cache entry has a TTL equal to the window, so
        # once it expires the counter is simply gone -- clearing the cache
        # here stands in for "a minute of real time has passed" without
        # actually sleeping the test suite for 60 seconds.
        cache.clear()
        response = self._attempt()
        self.assertEqual(response.status_code, 400)  # back to the normal wrong-password path, not 429


class PasswordResetThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='resetthrottle@example.com', username='resetthrottle@example.com',
            password='oldpass123', role='user',
        )

    def tearDown(self):
        cache.clear()

    @patch('user.views.send_email_task.delay')
    def test_fourth_reset_request_within_the_window_is_throttled(self, mock_delay):
        # 'password_reset' is rated 3/min.
        for _ in range(3):
            response = self.client.post('/api/user/password-reset/', {'email': self.user.email}, format='json')
            self.assertEqual(response.status_code, 200)
        throttled = self.client.post('/api/user/password-reset/', {'email': self.user.email}, format='json')
        self.assertEqual(throttled.status_code, 429)

    def test_confirm_endpoint_shares_the_same_scope_and_is_also_throttled(self):
        # request_password_reset and confirm_password_reset intentionally
        # share the 'password_reset' scope (see views.py) -- burning the
        # budget on bad confirm attempts should throttle the request
        # endpoint too, and vice versa.
        for _ in range(3):
            response = self.client.post('/api/user/password-reset/confirm/', {
                'token': 'not-a-real-token', 'new_password': 'irrelevant1', 'confirm_new_password': 'irrelevant1',
            }, format='json')
            self.assertEqual(response.status_code, 400)
        throttled = self.client.post('/api/user/password-reset/', {'email': self.user.email}, format='json')
        self.assertEqual(throttled.status_code, 429)


class PublicRegistrationRequiredFieldsTests(APITestCase):
    """A phone number is required for every self-signup (customer or
    owner) — see UserRegistrationSerializer.phone. A self-signed-up
    facility owner additionally needs business_name + location, mirroring
    what AdminCreateUserSerializer requires when an admin creates an owner
    account (see AdminCreateUserTests)."""

    def test_customer_signup_without_phone_is_rejected(self):
        response = self.client.post('/api/user/register/', {
            'email': 'nophonecustomer@example.com', 'password': 'brandnewpass123',
            'confirm_password': 'brandnewpass123', 'first_name': 'No', 'last_name': 'Phone', 'role': 'user',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.data['errors'])

    def test_customer_signup_with_phone_succeeds(self):
        response = self.client.post('/api/user/register/', {
            'email': 'withphonecustomer@example.com', 'password': 'brandnewpass123',
            'confirm_password': 'brandnewpass123', 'first_name': 'With', 'last_name': 'Phone',
            'phone': '9876543210', 'role': 'user',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_owner_signup_without_business_name_or_location_is_rejected(self):
        response = self.client.post('/api/user/register/', {
            'email': 'baldowner-signup@example.com', 'password': 'brandnewpass123',
            'confirm_password': 'brandnewpass123', 'first_name': 'Bald', 'last_name': 'Owner',
            'phone': '9876543210', 'role': 'owner',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('business_name', response.data['errors'])
        self.assertIn('location', response.data['errors'])

    def test_owner_signup_with_all_required_fields_succeeds(self):
        response = self.client.post('/api/user/register/', {
            'email': 'realowner-signup@example.com', 'password': 'brandnewpass123',
            'confirm_password': 'brandnewpass123', 'first_name': 'Real', 'last_name': 'Owner',
            'phone': '9876543210', 'role': 'owner', 'business_name': 'Real Owner Sports',
            'location': 'Bengaluru, Karnataka',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)


class SignupThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_eleventh_signup_within_the_window_is_throttled(self):
        # 'signup' is rated 10/hour.
        for i in range(10):
            response = self.client.post('/api/user/register/', {
                'email': f'signup{i}@example.com', 'password': 'brandnewpass123',
                'confirm_password': 'brandnewpass123', 'first_name': 'New', 'last_name': 'User',
                'phone': '9876543210', 'role': 'user',
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        throttled = self.client.post('/api/user/register/', {
            'email': 'oneMore@example.com', 'password': 'brandnewpass123',
            'confirm_password': 'brandnewpass123', 'first_name': 'New', 'last_name': 'User',
            'phone': '9876543210', 'role': 'user',
        }, format='json')
        self.assertEqual(throttled.status_code, 429)


# --- Token revocation on password change ("log out everywhere") ---
class TokenRevocationOnPasswordChangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='revoke@example.com', username='revoke@example.com',
            password='oldpass123', role='user',
        )

    def test_changing_password_blacklists_every_outstanding_refresh_token(self):
        # Two "sessions" -- e.g. a phone and a laptop -- each with their own
        # refresh token. RefreshToken.for_user() records an OutstandingToken
        # row automatically (see BlacklistMixin.for_user in simplejwt, active
        # because token_blacklist is installed), mirroring what really
        # happens whenever a client logs in or refreshes.
        session_a = RefreshToken.for_user(self.user)
        session_b = RefreshToken.for_user(self.user)
        self.assertEqual(
            OutstandingToken.objects.filter(user=self.user).count(), 2,
        )
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.user).count(), 0)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {session_a.access_token}')
        response = self.client.post('/api/user/change-password/', {
            'current_password': 'oldpass123',
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        # Both sessions' refresh tokens are now blacklisted -- including
        # session_a, the one that made this very request. This is the
        # deliberate "full stop, log in again" behavior, not a "keep the
        # current session alive" one.
        self.assertEqual(
            BlacklistedToken.objects.filter(token__user=self.user).count(), 2,
        )
        for refresh in (session_a, session_b):
            refresh_attempt = self.client.post(
                '/api/user/token/refresh/', {'refresh': str(refresh)}, format='json',
            )
            self.assertEqual(refresh_attempt.status_code, 401)

    def test_wrong_current_password_does_not_touch_any_token(self):
        session = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {session.access_token}')
        response = self.client.post('/api/user/change-password/', {
            'current_password': 'totally-wrong',
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.user).count(), 0)
        still_works = self.client.post('/api/user/token/refresh/', {'refresh': str(session)}, format='json')
        self.assertEqual(still_works.status_code, 200)


class TokenRevocationOnPasswordResetConfirmTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='resetrevoke@example.com', username='resetrevoke@example.com',
            password='oldpass123', role='user',
        )

    def test_confirming_a_reset_blacklists_every_outstanding_refresh_token(self):
        session_a = RefreshToken.for_user(self.user)
        session_b = RefreshToken.for_user(self.user)
        reset_token = PasswordResetToken.objects.create(
            user=self.user, expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )

        response = self.client.post('/api/user/password-reset/confirm/', {
            'token': reset_token.token,
            'new_password': 'brandnewpass123',
            'confirm_new_password': 'brandnewpass123',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(
            BlacklistedToken.objects.filter(token__user=self.user).count(), 2,
        )
        for refresh in (session_a, session_b):
            refresh_attempt = self.client.post(
                '/api/user/token/refresh/', {'refresh': str(refresh)}, format='json',
            )
            self.assertEqual(refresh_attempt.status_code, 401)
