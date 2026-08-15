# Booking Concurrency in BoxNplay

## Status

This document was rewritten from scratch to describe the **current**
concurrency model. The previous version described a DB-level
`unique_together = ('box', 'date', 'start_time')` constraint as the primary
defense against double-booking. That constraint no longer exists in that
form and was never, on its own, the real story — the current system is a
**Redis-backed hold/wait-queue engine** (`backend/BookMyBox/bookings/reservation.py`)
that gives contended slots a live UX (a short-lived hold with a countdown,
or a FIFO queue position), backed by a DB-level safety net that remains
authoritative for correctness.

Read this together with `backend/BookMyBox/bookings/reservation.py` (the
canonical source — it's short, heavily commented, and the actual ground
truth) and `backend/BookMyBox/DEPLOYMENT.md`'s "Process model" section
(what has to be running for this to work).

---

## Table of Contents

1. [Overview](#overview)
2. [What a "slot" means here](#what-a-slot-means-here)
3. [Layer 1: The Redis hold/queue engine](#layer-1-the-redis-holdqueue-engine)
4. [Layer 2: The database safety net](#layer-2-the-database-safety-net)
5. [The full lifecycle, end to end](#the-full-lifecycle-end-to-end)
6. [WebSocket delivery](#websocket-delivery)
7. [Owner preemption (walk-in bookings)](#owner-preemption-walk-in-bookings)
8. [Paths that skip the Redis layer entirely](#paths-that-skip-the-redis-layer-entirely)
9. [Known scope limitation](#known-scope-limitation)
10. [Failure modes and what happens](#failure-modes-and-what-happens)
11. [Where to look in the code](#where-to-look-in-the-code)

---

## Overview

Two independent users trying to book the same slot at the same time need
two different things:

1. **A good experience** — instead of both submitting and one getting a
   confusing error, the first gets a short-lived hold with a visible
   countdown to complete checkout; the second sees "someone's booking
   this — you're #1 in line" and is promoted automatically if the first
   person doesn't finish.
2. **A correctness guarantee** — no matter what races happen at the
   network/Redis layer, the database must never end up with two active
   bookings for the same box/date/time.

BoxNplay's design (deliberately, per the module docstring in
`reservation.py`) splits these into two layers that don't try to be the
same mechanism:

- **Redis** (`bookings/reservation.py`) is a fast, ephemeral, UX-facing
  hold/queue engine. It is never the final word on whether a `Booking` row
  gets written.
- **PostgreSQL/SQLite**, via `transaction.atomic()` + `select_for_update()`
  + an interval-overlap check + a conditional unique constraint, is the
  authoritative safety net. Even if the Redis layer were disabled or
  buggy, the database still cannot end up with two conflicting bookings.

---

## What a "slot" means here

A **slot signature** is the exact tuple a user requested:

```
box_id | date | start_time | duration
```

(`bookings/reservation.py::slot_signature()`). This is deliberately
narrower than "does this interval overlap any other booking on this box" —
it's "does this *exact* box+date+start_time+duration request collide with
another identical request." Two requests for the same box/date/start_time
but *different* durations (a 1-hour @ 09:00 vs. a 2-hour @ 09:00) get
**independent** Redis holds and queues; see [Known scope
limitation](#known-scope-limitation) for why that's an accepted trade-off,
not an oversight.

---

## Layer 1: The Redis hold/queue engine

All state lives in Redis, in a logical database reserved just for this
purpose (`REDIS_RESERVATION_URL`, default `{REDIS_URL}/3` — see
`BookMyBox/settings.py`), isolated from the Django cache, the Channels
channel layer, and the Celery broker, which each get their own logical DB.
No view, consumer, or Celery task talks to `redis-py` directly outside of
`reservation.py` — it's the sole owner of this state and never leaks a raw
Redis reply across its public functions (everything returns small
dataclasses: `ReserveResult`, `ConfirmResult`, `ReleaseResult`,
`HoldStatus`, `PreemptResult`).

Three Redis keys exist per slot signature:

- `hold:{sig}` — a `SET ... EX <ttl>` string, value `"{user_id}:{hold_token}"`.
  Its existence *is* the hold; its TTL is what makes an abandoned hold
  self-expire.
- `queue:{sig}` — a Redis list of `"{user_id}|{hold_token}"` entries, FIFO
  (`RPUSH` to join, `LPOP` to promote).
- `holdmeta:{hold_token}` — a hash (`{sig, user_id}`) that lets any later
  call (confirm, release, status check) reverse-look-up which slot a given
  `hold_token` belongs to, without the caller needing to pass the full
  signature around. TTL'd generously (24h) purely as a GC safety net.

Every state transition is a **single Lua script**, run atomically via
`EVAL`/`register_script`. Plain `WATCH`/`MULTI` is awkward for "read,
branch, then act differently depending on what you read" logic — Lua
scripting is Redis's standard answer for that shape of problem, and it
means there's no window between "check who holds this" and "act on it"
where another request could interleave.

The four scripts, and the public function that wraps each:

| Script | Public function | What it does |
|---|---|---|
| `_TRY_ACQUIRE_OR_ENQUEUE` | `reserve_slot()` | If nobody holds the slot, grant the hold. If the caller already holds it (idempotent retry), hand back their existing token. If someone else holds it, either return their existing queue position (idempotent retry) or append them to the queue. |
| `_CONFIRM_AND_RELEASE` | `confirm_reservation()` | Verify the caller is really the current holder, then atomically delete the hold, delete the queue (the slot is being permanently taken, not freed), and return everyone who was queued so they can be told the slot is gone. |
| `_EXPIRE_OR_RELEASE_AND_PROMOTE` | `release_hold()` / `expire_hold()` (same function, two names) | Verify the expected holder (or no-op if the hold is already gone — makes duplicate/stale calls safe), delete the hold, pop the next queued user if any, and grant them a fresh hold with a fresh TTL. This is what makes the queue cascade. |
| `_PREEMPT` | `preempt_slot()` | Unconditionally clear both the hold and the *entire* queue at once (no expected-holder check) — used only by the owner walk-in booking path, see below. |

`reserve_slot()` is idempotent by design: a double-click or a client
retry-after-timeout mints a fresh `hold_token` client-side (it has no way
to know a token from a request whose response it never saw), but the Lua
script recognizes the same `user_id` already holding or already queued and
hands back the *original* token rather than creating a duplicate queue
entry behind the user's own existing one. Callers must always trust the
token the script returns, not the one they proposed.

---

## Layer 2: The database safety net

The Redis layer above is deliberately never trusted as the final word.
Every path that actually writes a `Booking` row —
`bookings/services.py::create_booking_row()`, called from the `confirm`
endpoint, the direct-create endpoint, the recurring-booking endpoint, and
the owner walk-in endpoint alike — goes through the same guarded write:

1. `transaction.atomic()` wraps the whole check-then-write.
2. `select_for_update()` locks the relevant box row for the duration of
   the check, so two concurrent writers targeting the same box serialize
   against each other instead of racing.
3. An interval-overlap check (`Booking.overlaps()`) rejects the write if
   it would conflict with any other `Confirmed`/`Completed` booking on
   that box/date — this is a real overlap check (start/end interval
   math), not just an exact-start-time match.
4. A DB-level `UniqueConstraint` on `Booking` — `fields=['box', 'date',
   'start_time']`, `condition=Q(booking_status__in=['Confirmed',
   'Completed'])` — is the final, unconditional backstop. It's
   conditional (scoped to active statuses only) specifically so a
   cancelled or no-show booking never blocks a new booking from reusing
   that same slot.

Because this layer is authoritative and self-contained, it protects the
system even against paths that bypass Redis entirely (recurring bookings,
owner walk-in bookings — see below) and even in the hypothetical case of a
Redis outage mid-reservation.

---

## The full lifecycle, end to end

**Happy path — a single contended slot, two users:**

1. User A calls `POST /api/bookings/reserve/`. `reserve_slot()` finds no
   existing hold, grants one (`hold:sig` set with a TTL from
   `RESERVATION_HOLD_TTL_SECONDS`, default 300s), and the view schedules a
   Celery task (`expire_hold_task`) via `apply_async(eta=<hold's expiry>)`
   — a one-shot, not a recurring beat job.
2. User B calls `reserve/` for the identical signature a moment later.
   `reserve_slot()` sees A's hold, appends B to `queue:sig`, and returns
   `{status: 'queued', position: 1}`.
3. Both users' frontends open a WebSocket to the slot's group (see below)
   and get live pushes from here on, in addition to whatever the initial
   HTTP response said.
4. **If A confirms in time:** `POST /api/bookings/confirm/{hold_token}/`
   calls `confirm_reservation()` (verifies A really holds it, clears hold
   + queue), then `create_booking_row()` writes the real `Booking` row
   inside the DB safety net described above. The view broadcasts
   `slot_booked` to the group and B is told the slot is gone (not
   promoted — it's permanently taken).
5. **If A does nothing and the hold expires:** the scheduled
   `expire_hold_task` fires, calls `release_hold()`/`expire_hold()`,
   which deletes A's hold and promotes B (`LPOP` from the queue, grants B
   a fresh hold + TTL). The task then reschedules *its own* expiry check
   for B's new deadline — this self-rescheduling is what makes the
   cascade continue automatically through however many queued users there
   are, with no periodic polling involved.
6. **If A explicitly gives up** (`POST /api/bookings/release_hold/{hold_token}/`),
   the same promote-the-next-user logic runs immediately rather than
   waiting for the TTL.

**If the DB write in step 4 is ever rejected** (the interval-overlap check
or the unique constraint catches something Redis's exact-signature model
couldn't see — see [Known scope limitation](#known-scope-limitation)), the
view releases A's hold and promotes the next queued user, exactly as if A
had abandoned it — the customer sees a clear "someone else's booking beat
you to it" rather than a silent failure.

---

## WebSocket delivery

Route: `ws/bookings/slot/<box_id>/<date>/<start_time>/<duration>/`
(`bookings/routing.py` → `consumers.SlotStatusConsumer`). One Channels
group per exact slot signature — everyone holding or queued for that
specific slot joins the same group.

**Auth**: browsers can't set an `Authorization` header on a WebSocket
handshake, so `bookings/ws_auth.py::JWTAuthMiddleware` reads
`?token=<access_token>` off the query string and validates it via
`rest_framework_simplejwt`'s `AccessToken`, setting `scope['user']`
accordingly. An unauthenticated connection is closed with code `4001`.

**On connect**, the consumer immediately sends a resync message so a page
refresh mid-hold/mid-queue shows correct state right away instead of a
stale "idle": `{'type': 'idle'}`, `{'type': 'held', 'expires_at': ...}`, or
`{'type': 'queued', 'position': ...}`, computed by re-deriving from the
Redis hold/queue keys, never from cached state.

**Server → client push types**, all originating from `bookings/broadcasting.py`
helpers called from `tasks.py`, `views.py`, and `owner_dashboard/views.py`:

- `promoted` — the next queued user was granted the hold (from an expiry
  or explicit release). Includes `new_holder_user_id`/`expires_at` so a
  client can tell "it's my turn now" from "someone ahead of me left, I
  just moved up in the queue."
- `slot_released` — the queue fully drained; nobody left to promote.
- `slot_booked` — someone confirmed the slot into a real `Booking`.
  Includes `booked_by_user_id` so the confirming client's own socket can
  distinguish "I did this" from "I lost."
- `owner_reserved` — the box owner preempted the slot via a walk-in
  booking (see next section).

There is no client → server message protocol beyond the initial handshake
— every state change is driven by REST calls (`reserve`/`confirm`/
`release_hold`/the owner's `book`), and the socket is a pure server-push
read channel.

---

## Owner preemption (walk-in bookings)

`owner_dashboard/views.py::OwnerBookingViewSet.book()` lets a box owner
claim a slot on their own box directly — e.g. a walk-in customer paying
cash at the venue. This is the one place `preempt_slot()` is used instead
of `release_hold()`/`expire_hold()`: preemption clears the hold **and the
entire queue** unconditionally, because the slot isn't being freed for the
next person in line — it's being taken away from everyone at once by the
venue itself.

Every displaced user (the current holder, plus everyone who was queued)
gets both a live `owner_reserved` WebSocket push and a persisted in-app
notification (belt-and-suspenders in case their socket isn't connected at
that moment), then the owner's booking is written via the same
`create_booking_row()` DB safety net as any other booking, with
`booking_source='owner_manual'`. If the slot already has a real
`Confirmed`/`Completed` booking, the owner is rejected (409) — this path
never overrides a paying customer's already-confirmed booking, only holds
and queue positions.

---

## Paths that skip the Redis layer entirely

Not every booking goes through `reserve`/`confirm`. Two paths write
directly via `create_booking_row()`:

- **Recurring bookings** (`POST /api/bookings/recurring/`) — a customer
  booking the same slot weekly for 2–12 future occurrences. These are
  proactive future bookings, not hot-contested "everyone's fighting over
  this slot right now" scenarios, so there's no UX value in a hold/queue
  — each week is validated and written independently, and partial success
  (some weeks succeed, some don't) is the expected, normal outcome.
- **Owner walk-in bookings** — described above; these bypass `reserve` by
  design (that's the point of preemption) but still call `preempt_slot()`
  first to clear out any live Redis state before writing.

Both rely solely on the [database safety net](#layer-2-the-database-safety-net)
for correctness — which is exactly why that layer is designed to be
self-sufficient rather than a mere backstop for the Redis layer.

---

## Known scope limitation

**Cross-signature overlap isn't queued together.** The Redis layer scopes
contention to the exact `(box, date, start_time, duration)` signature a
user requested. Two different-duration requests for the same
box+date+start_time — say, a 1-hour booking and a 2-hour booking both
starting at 09:00 — get **independent** holds and queues with no mutual
awareness of each other in Redis.

This is a deliberate, documented trade-off (see the module docstring in
`reservation.py` and the "Known limitations" section of
`DEPLOYMENT.md`), not a bug: the frontend only ever offers a fixed set of
hourly slot buttons, so identical-signature collisions are the dominant
real-world case, and the [database safety net](#layer-2-the-database-safety-net)
(`overlaps()` + the conditional unique constraint) remains fully
authoritative and will correctly reject whichever of the two conflicting
bookings loses — the customer just gets a plain "this slot's no longer
available" error in that specific edge case rather than a graceful queue
promotion. Closing this gap would mean modelling per-box-per-day interval
trees in Redis; not implemented, and not currently planned as a priority.

---

## Failure modes and what happens

| Scenario | Result |
|---|---|
| Two users `reserve()` the same signature simultaneously | Redis `SET ... EX` + the Lua script's atomicity guarantee exactly one gets `held`, the other gets `queued` at position 1. No race window. |
| A held user's browser crashes / they close the tab | The hold's TTL (`RESERVATION_HOLD_TTL_SECONDS`) expires normally; `expire_hold_task` fires at the scheduled ETA and promotes the next queued user. No manual cleanup needed. |
| A `confirm()` call arrives for a hold that already expired | `confirm_reservation()`'s `get_holdmeta()` lookup returns `None` (holdmeta TTL'd, hold gone) → `ConfirmResult(status='invalid')`. The view returns an error rather than writing a stale booking. |
| The DB write at confirm-time is rejected (overlap/unique-constraint) despite Redis saying this user held the slot | The view releases the hold (promoting the next queued user) and returns an error — this only happens via the [known scope limitation](#known-scope-limitation) above, since same-signature collisions can't reach this state (Redis already serialized them). |
| A duplicate/stale `expire_hold_task` fires (e.g. after the holder already confirmed or released early) | The Lua script's expected-holder guard makes this a safe no-op (`status: 'stale'`) — nothing is promoted, nothing breaks. |
| Redis itself is unavailable | The hold/queue UX layer fails; anything routed through `reserve`/`confirm` would error. The DB safety net alone still guarantees no double-booking for any write path that reaches it (recurring/owner-manual paths never touched Redis in the first place). Redis is a hard operational dependency for the *reserve/confirm* UX, not for booking-row correctness. |

---

## Where to look in the code

- `backend/BookMyBox/bookings/reservation.py` — the engine itself; short,
  heavily commented, read this first.
- `backend/BookMyBox/bookings/views.py` — `reserve`, `confirm`,
  `release_hold` actions on `BookingViewSet`.
- `backend/BookMyBox/bookings/services.py` — `create_booking_row()`, the
  DB safety net.
- `backend/BookMyBox/bookings/models.py` — the `Booking.overlaps()` method
  and the conditional `UniqueConstraint` in `Meta`.
- `backend/BookMyBox/bookings/tasks.py` — `expire_hold_task`, the
  self-rescheduling Celery task.
- `backend/BookMyBox/bookings/consumers.py`, `routing.py`, `ws_auth.py`,
  `broadcasting.py` — the WebSocket delivery layer.
- `backend/BookMyBox/owner_dashboard/views.py` — `OwnerBookingViewSet.book()`,
  the preemption path.
- `backend/BookMyBox/DEPLOYMENT.md` — what processes (Redis, ASGI server,
  Celery worker, Celery Beat) must actually be running for this to work,
  and the same known-limitation writeup from an operations angle.
