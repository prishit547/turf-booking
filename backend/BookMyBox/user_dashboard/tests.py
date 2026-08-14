from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from boxes.models import Box
from bookings.models import Booking
from user_dashboard.gamification import GamificationService, trigger_gamification_check
from user_dashboard.models import Achievement, OwnerGameStats, UserBadge, UserGameStats

User = get_user_model()


def make_user(email, role='user', **extra):
    return User.objects.create_user(
        email=email, username=email, password='testpass123', role=role,
        phone='1234567890', location='Mumbai', **extra,
    )


class LevelCalculationTests(APITestCase):
    """update_level()/get_level_name() are the only DB-independent logic in
    this app — everything else in gamification.py hits the DB."""

    def test_user_stats_level_thresholds(self):
        cases = [(0, 1, 'Beginner'), (50, 2, 'Intermediate'), (200, 3, 'Advanced'), (500, 4, 'Expert'), (1000, 5, 'Champion')]
        for points, expected_level, expected_name in cases:
            stats = UserGameStats(total_points=points)
            stats.update_level()
            self.assertEqual(stats.level, expected_level, f"{points} points")
            self.assertEqual(stats.get_level_name(), expected_name)

    def test_owner_stats_level_thresholds(self):
        cases = [(0, 1, 'Starter'), (100, 2, 'Growing'), (500, 3, 'Established'), (1000, 4, 'Professional'), (2000, 5, 'Elite Business')]
        for points, expected_level, expected_name in cases:
            stats = OwnerGameStats(total_points=points)
            stats.update_level()
            self.assertEqual(stats.level, expected_level, f"{points} points")
            self.assertEqual(stats.get_level_name(), expected_name)


class CreateAchievementsCommandTests(APITestCase):
    def test_seeds_default_achievements(self):
        call_command('create_achievements')
        self.assertEqual(Achievement.objects.count(), 11)
        self.assertTrue(Achievement.objects.filter(name='First Timer', achievement_type='user').exists())
        self.assertTrue(Achievement.objects.filter(name='New Business', achievement_type='owner').exists())

    def test_idempotent_on_rerun(self):
        call_command('create_achievements')
        call_command('create_achievements')
        self.assertEqual(Achievement.objects.count(), 11)


class GamificationServiceTests(APITestCase):
    def setUp(self):
        GamificationService.create_default_achievements()
        self.user = make_user('player@example.com')
        self.owner = make_user('owner@example.com', role='owner', business_name='Elite Sports')

    def test_first_booking_awards_first_timer_badge(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )
        # the post_save signal on Booking already triggered this once; call
        # again directly to assert the service's own return value too
        newly_awarded = GamificationService.check_and_award_user_badges(self.user)
        awarded_names = {a.name for a in newly_awarded}
        # already awarded by the signal on booking creation, so a second
        # direct call should award nothing further (idempotent via get_or_create)
        self.assertEqual(awarded_names, set())
        self.assertTrue(UserBadge.objects.filter(user=self.user, achievement__name='First Timer').exists())

    def test_awarding_requires_the_achievement_to_exist(self):
        Achievement.objects.filter(name='First Timer').delete()
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )
        self.assertFalse(UserBadge.objects.filter(user=self.user, achievement__name='First Timer').exists())

    def test_box_approval_awards_new_business_badge_to_owner(self):
        Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        self.assertTrue(UserBadge.objects.filter(user=self.owner, achievement__name='New Business').exists())

    def test_trigger_gamification_check_dispatches_by_type(self):
        user_result = trigger_gamification_check(self.user, 'user')
        owner_result = trigger_gamification_check(self.owner, 'owner')
        unknown_result = trigger_gamification_check(self.user, 'bogus')
        self.assertIsInstance(user_result, list)
        self.assertIsInstance(owner_result, list)
        self.assertEqual(unknown_result, [])

    def test_user_game_stats_updated_after_booking(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )
        stats = UserGameStats.objects.get(user=self.user)
        self.assertEqual(stats.total_spent, 1000)

    def test_completed_booking_still_counts_toward_points_and_badges(self):
        # Regression: check_and_award_user_badges used to filter
        # booking_status='Confirmed' only, so points/badges reset to zero
        # as soon as a booking aged into 'Completed'.
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Completed',
        )
        GamificationService.check_and_award_user_badges(self.user)

        stats = UserGameStats.objects.get(user=self.user)
        self.assertEqual(stats.total_bookings, 1)
        self.assertGreater(stats.total_points, 0)
        self.assertTrue(UserBadge.objects.filter(user=self.user, achievement__name='First Timer').exists())


class DashboardAnalyticsTests(APITestCase):
    def setUp(self):
        self.user = make_user('player@example.com')
        self.owner = make_user('owner@example.com', role='owner', business_name='Elite Sports')
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        response = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(response.status_code, 401)

    def test_empty_state(self):
        response = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_spent'], 0)
        self.assertEqual(response.data['cancellation_rate'], 0)
        self.assertEqual(response.data['sport_distribution'], [])

    def test_totals_reflect_confirmed_bookings_only(self):
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Confirmed',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-02', start_time='10:00', end_time='11:00',
            duration=1, total_amount=500, booking_status='Cancelled',
        )

        response = self.client.get('/api/dashboard/analytics/')

        self.assertEqual(float(response.data['total_spent']), 1000.0)
        self.assertEqual(response.data['total_hours_played'], 2)
        self.assertEqual(response.data['cancellation_rate'], 50.0)  # 1 of 2 total bookings cancelled

    def test_totals_also_include_completed_bookings(self):
        # Regression: booking_status transitions to 'Completed' (see
        # bookings/tasks.py::mark_completed_bookings_task) once a slot's
        # date/time passes — analytics must not go back to zero just
        # because history aged out of 'Confirmed'.
        box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        Booking.objects.create(
            user=self.user, box=box, date='2026-08-01', start_time='10:00', end_time='12:00',
            duration=2, total_amount=1000, booking_status='Completed',
        )

        response = self.client.get('/api/dashboard/analytics/')

        self.assertEqual(float(response.data['total_spent']), 1000.0)
        self.assertEqual(response.data['total_hours_played'], 2)
        self.assertNotEqual(response.data['sport_distribution'], [])


class DashboardFavoritesTests(APITestCase):
    def setUp(self):
        self.user = make_user('player@example.com')
        self.owner = make_user('owner@example.com', role='owner', business_name='Elite Sports')
        self.box = Box.objects.create(
            name='Elite Cricket Box', sport='Cricket', sports=['Cricket'], location='Mumbai',
            price=500, capacity=20, owner=self.owner, status='approved',
        )
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_add_favorite(self):
        response = self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Elite Cricket Box')

    def test_add_favorite_missing_box_id(self):
        response = self.client.post('/api/dashboard/favorites/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_add_favorite_unapproved_box_rejected(self):
        self.box.status = 'pending'
        self.box.save()
        response = self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_add_favorite_twice_returns_200_not_201(self):
        self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        response = self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_list_favorites(self):
        self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        response = self.client.get('/api/dashboard/favorites/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_remove_favorite_via_body(self):
        self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        response = self.client.delete('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/dashboard/favorites/').data, [])

    def test_remove_favorite_via_url_param(self):
        self.client.post('/api/dashboard/favorites/', {'box_id': self.box.id}, format='json')
        response = self.client.delete(f'/api/dashboard/favorites/{self.box.id}/remove/')
        self.assertEqual(response.status_code, 200)

    def test_remove_nonexistent_favorite_404(self):
        response = self.client.delete(f'/api/dashboard/favorites/{self.box.id}/remove/')
        self.assertEqual(response.status_code, 404)


class GameStatsViewTests(APITestCase):
    def setUp(self):
        GamificationService.create_default_achievements()
        self.user = make_user('player@example.com')
        self.owner = make_user('owner@example.com', role='owner', business_name='Elite Sports')

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_user_game_stats_endpoint(self):
        self._auth(self.user)
        response = self.client.get('/api/dashboard/user-stats/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('stats', response.data)
        self.assertIn('badges', response.data)
        self.assertEqual(response.data['total_badges'], 0)

    def test_owner_game_stats_endpoint(self):
        self._auth(self.owner)
        response = self.client.get('/api/dashboard/owner-stats/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('stats', response.data)

    def test_achievements_endpoint_lists_active_user_achievements(self):
        self._auth(self.user)
        response = self.client.get('/api/dashboard/achievements/')
        self.assertEqual(response.status_code, 200)
        names = {a['name'] for a in response.data}
        self.assertIn('First Timer', names)
        self.assertNotIn('New Business', names)  # owner-only achievement
