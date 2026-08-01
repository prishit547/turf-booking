"""
Tests for bookings/reservation.py against a REAL Redis instance (the
docker-compose 'redis' service) — Lua script behavior is worth proving
against the genuine article rather than a Python reimplementation
(fakeredis) that could silently diverge from real Redis semantics.

Requires Redis reachable at settings.REDIS_RESERVATION_URL (defaults to
redis://localhost:6379/3 — `docker compose up -d redis` starts it).
"""

from concurrent.futures import ThreadPoolExecutor

from django.test import SimpleTestCase

from bookings import reservation


class ReservationTestCase(SimpleTestCase):
    databases = []  # no Django DB needed — this module is pure Redis

    def setUp(self):
        reservation.get_client().flushdb()

    def tearDown(self):
        reservation.get_client().flushdb()

    def _slot(self):
        return dict(box_id=1, date='2030-01-15', start_time='10:00', duration=1)


class SingleAcquireTests(ReservationTestCase):
    def test_first_request_gets_held(self):
        result = reservation.reserve_slot(**self._slot(), user_id=1)
        self.assertEqual(result.status, 'held')
        self.assertIsNotNone(result.hold_token)
        self.assertGreater(result.expires_at, 0)

    def test_second_request_gets_queued_at_position_1(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        result = reservation.reserve_slot(**self._slot(), user_id=2)
        self.assertEqual(result.status, 'queued')
        self.assertEqual(result.position, 1)

    def test_sequential_queuers_get_sequential_positions(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        positions = [
            reservation.reserve_slot(**self._slot(), user_id=uid).position
            for uid in range(2, 6)
        ]
        self.assertEqual(positions, [1, 2, 3, 4])

    def test_duplicate_request_from_holder_is_idempotent(self):
        first = reservation.reserve_slot(**self._slot(), user_id=1)
        second = reservation.reserve_slot(**self._slot(), user_id=1)
        self.assertEqual(second.status, 'held')
        self.assertEqual(second.hold_token, first.hold_token)

    def test_duplicate_request_from_queued_user_does_not_double_enqueue(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        first = reservation.reserve_slot(**self._slot(), user_id=2)
        second = reservation.reserve_slot(**self._slot(), user_id=2)
        self.assertEqual(first.position, second.position)
        # queue should still only have one entry for user 2
        third = reservation.reserve_slot(**self._slot(), user_id=3)
        self.assertEqual(third.position, 2)

    def test_different_signatures_are_independent(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        other_slot = dict(self._slot(), duration=2)  # different signature
        held_too = reservation.reserve_slot(**other_slot, user_id=2)
        self.assertEqual(held.status, 'held')
        self.assertEqual(held_too.status, 'held')


class ConfirmTests(ReservationTestCase):
    def test_holder_can_confirm(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        result = reservation.confirm_reservation(held.hold_token, user_id=1)
        self.assertEqual(result.status, 'confirmed')

    def test_confirm_drains_queue_instead_of_promoting(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        reservation.reserve_slot(**self._slot(), user_id=2)
        reservation.reserve_slot(**self._slot(), user_id=3)

        result = reservation.confirm_reservation(held.hold_token, user_id=1)

        self.assertEqual(result.status, 'confirmed')
        self.assertEqual(sorted(uid for uid, _ in result.released_queue), ['2', '3'])
        # slot is fully clear now, not held by anyone
        status = reservation.get_hold_status(held.hold_token)
        self.assertFalse(status.found)

    def test_non_holder_cannot_confirm(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        queued = reservation.reserve_slot(**self._slot(), user_id=2)
        result = reservation.confirm_reservation(queued.hold_token, user_id=2)
        self.assertEqual(result.status, 'invalid')

    def test_wrong_user_cannot_confirm_someone_elses_hold(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        result = reservation.confirm_reservation(held.hold_token, user_id=999)
        self.assertEqual(result.status, 'invalid')

    def test_confirm_with_unknown_token_is_invalid(self):
        result = reservation.confirm_reservation('does-not-exist', user_id=1)
        self.assertEqual(result.status, 'invalid')


class ExpireAndReleaseTests(ReservationTestCase):
    def test_release_promotes_next_in_queue(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        queued = reservation.reserve_slot(**self._slot(), user_id=2)

        result = reservation.release_hold(held.hold_token)

        self.assertEqual(result.status, 'promoted')
        self.assertEqual(result.new_user_id, '2')
        self.assertEqual(result.new_hold_token, queued.hold_token)
        self.assertEqual(result.remaining, 0)

        status = reservation.get_hold_status(queued.hold_token)
        self.assertTrue(status.found)
        self.assertEqual(status.status, 'held')

    def test_release_with_empty_queue_drains(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        result = reservation.release_hold(held.hold_token)
        self.assertEqual(result.status, 'drained')

    def test_stale_release_is_a_safe_noop(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        reservation.confirm_reservation(held.hold_token, user_id=1)
        # a duplicate/late expiry check firing after confirm already ran
        result = reservation.release_hold(held.hold_token)
        self.assertEqual(result.status, 'stale')

    def test_expire_hold_is_an_alias_for_release_hold(self):
        self.assertIs(reservation.expire_hold, reservation.release_hold)

    def test_double_promotion_does_not_happen(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        reservation.reserve_slot(**self._slot(), user_id=2)

        first = reservation.release_hold(held.hold_token)
        second = reservation.release_hold(held.hold_token)  # duplicate/late call

        self.assertEqual(first.status, 'promoted')
        self.assertEqual(second.status, 'stale')


class GetHoldStatusTests(ReservationTestCase):
    def test_unknown_token_not_found(self):
        status = reservation.get_hold_status('nope')
        self.assertFalse(status.found)

    def test_held_status(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        status = reservation.get_hold_status(held.hold_token)
        self.assertTrue(status.found)
        self.assertEqual(status.status, 'held')
        self.assertEqual(status.position, 0)

    def test_queued_status(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        queued = reservation.reserve_slot(**self._slot(), user_id=2)
        status = reservation.get_hold_status(queued.hold_token)
        self.assertTrue(status.found)
        self.assertEqual(status.status, 'queued')
        self.assertEqual(status.position, 1)

    def test_status_after_confirm_by_someone_else_is_not_found(self):
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        queued = reservation.reserve_slot(**self._slot(), user_id=2)
        reservation.confirm_reservation(held.hold_token, user_id=1)
        status = reservation.get_hold_status(queued.hold_token)
        self.assertFalse(status.found)

    def test_get_queue_position_helper(self):
        reservation.reserve_slot(**self._slot(), user_id=1)
        queued = reservation.reserve_slot(**self._slot(), user_id=2)
        self.assertEqual(reservation.get_queue_position(queued.hold_token), 1)
        held = reservation.reserve_slot(**self._slot(), user_id=1)
        self.assertIsNone(reservation.get_queue_position(held.hold_token))


class ConcurrencyProofTests(ReservationTestCase):
    def test_fifty_concurrent_requests_exactly_one_held_rest_queued_uniquely(self):
        """The direct, automated proof of the '50 people, 1 slot' scenario:
        hammer one identical signature with 50 real threads simultaneously
        and assert the Lua script's atomicity holds — exactly one winner,
        everyone else gets a unique, gap-free sequential queue position."""
        slot = self._slot()

        def attempt(user_id):
            return reservation.reserve_slot(**slot, user_id=user_id)

        with ThreadPoolExecutor(max_workers=50) as pool:
            results = list(pool.map(attempt, range(1, 51)))

        held = [r for r in results if r.status == 'held']
        queued = [r for r in results if r.status == 'queued']

        self.assertEqual(len(held), 1, "exactly one request must win the hold")
        self.assertEqual(len(queued), 49)

        positions = sorted(r.position for r in queued)
        self.assertEqual(positions, list(range(1, 50)), "queue positions must be unique and gap-free")

        hold_tokens = {r.hold_token for r in results}
        self.assertEqual(len(hold_tokens), 50, "every request must get its own distinct hold_token")
