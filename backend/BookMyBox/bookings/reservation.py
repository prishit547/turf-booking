"""
Redis-backed slot reservation + FIFO wait-queue engine.

Scope (deliberate, see the project plan): a "slot" here is the exact
(box_id, date, start_time, duration) signature a user requested — not a
general overlapping-interval model. Two different-duration requests for
the same box+date+start_time get independent holds/queues; the existing
DB-level transaction.atomic() + select_for_update() + overlaps() check in
bookings/views.py remains the authoritative safety net for that gap. This
module is a fast-path/UX layer on top of that, never a replacement for it.

No view, consumer, or Celery task should talk to redis-py directly — this
module is the only thing in the codebase that does, and it never leaks a
raw Redis/Lua reply across its public functions (everything returns small
dataclasses).
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Literal, Optional

import redis
from django.conf import settings

_client = None
_scripts = {}


def get_client():
    """Lazily-constructed, process-wide Redis client for reservation state.

    Deliberately a separate connection pool from the Django cache backend
    (django_redis) — different logical DB, different purpose, and this
    module needs raw script/EVAL access that the cache abstraction doesn't
    expose.
    """
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_RESERVATION_URL, decode_responses=True)
    return _client


def reset_client():
    """Test-only: drop the cached client/scripts so a new one is built on
    next use (e.g. after monkeypatching settings.REDIS_RESERVATION_URL)."""
    global _client, _scripts
    _client = None
    _scripts = {}


# ---------------------------------------------------------------------------
# Key naming
# ---------------------------------------------------------------------------

def slot_signature(box_id, date, start_time, duration):
    """Canonical string identifying one exact bookable slot request.

    Uses '|' as the delimiter, not ':' — start_time is "HH:MM" and would
    make a ':'-joined signature ambiguous to split back apart.
    """
    return f"{box_id}|{date}|{start_time}|{duration}"


def parse_slot_signature(sig):
    """Inverse of slot_signature() — reconstructs the four components a
    caller needs (e.g. to write the actual Booking row after a confirm)."""
    box_id, date, start_time, duration = sig.split('|')
    return {'box_id': box_id, 'date': date, 'start_time': start_time, 'duration': int(duration)}


def expires_at_to_eta(expires_at_ts):
    """Converts a reservation.py unix-timestamp expiry into a timezone-aware
    datetime suitable for Celery's apply_async(eta=...)."""
    from datetime import datetime, timezone as dt_timezone
    return datetime.fromtimestamp(expires_at_ts, tz=dt_timezone.utc)


def _hold_key(sig):
    return f"hold:{sig}"


def _queue_key(sig):
    return f"queue:{sig}"


def _holdmeta_key(hold_token):
    return f"holdmeta:{hold_token}"


HOLDMETA_TTL_SECONDS = 24 * 60 * 60  # generous GC safety net, see module docstring


# ---------------------------------------------------------------------------
# Lua scripts — each one is a single atomic multi-key operation. Plain
# WATCH/MULTI is awkward for "read, branch, then act differently depending
# on what was read" logic like this; Lua scripting is Redis's standard
# answer for that shape of problem.
# ---------------------------------------------------------------------------

# KEYS[1] = hold_key, KEYS[2] = queue_key, KEYS[3] = holdmeta_key
# ARGV[1] = user_id, ARGV[2] = hold_token, ARGV[3] = ttl_seconds,
# ARGV[4] = now_ts (unix seconds), ARGV[5] = sig, ARGV[6] = holdmeta_ttl_seconds
_TRY_ACQUIRE_OR_ENQUEUE = """
local hold_key = KEYS[1]
local queue_key = KEYS[2]
local holdmeta_key = KEYS[3]
local user_id = ARGV[1]
local hold_token = ARGV[2]
local ttl_seconds = tonumber(ARGV[3])
local now_ts = tonumber(ARGV[4])
local sig = ARGV[5]
local holdmeta_ttl = tonumber(ARGV[6])
local holder_value = user_id .. ':' .. hold_token

local current = redis.call('GET', hold_key)

if current == false then
    redis.call('SET', hold_key, holder_value, 'EX', ttl_seconds)
    local expires_at = now_ts + ttl_seconds
    redis.call('HSET', holdmeta_key, 'sig', sig, 'user_id', user_id)
    redis.call('EXPIRE', holdmeta_key, ttl_seconds + 60)
    return {'held', tostring(expires_at), hold_token}
end

-- Idempotency is keyed on user_id alone, not the full "user_id:hold_token"
-- value: a retry (double-click, client timeout-and-resend, etc.) mints a
-- brand new hold_token client-side each call since it has no way to know
-- the token from a request whose response it never saw, so comparing the
-- full holder_value would never match and would wrongly re-enqueue an
-- already-holding user behind themselves. Hand back their EXISTING token.
local sep = string.find(current, ':', 1, true)
local current_user_id = string.sub(current, 1, sep - 1)
local current_hold_token = string.sub(current, sep + 1)

if current_user_id == user_id then
    local pttl = redis.call('PTTL', hold_key)
    local expires_at = now_ts + (pttl / 1000)
    return {'held', tostring(expires_at), current_hold_token}
end

-- already held by someone else: check for an existing queue entry from
-- this same user (idempotent retry) before appending a new one
local items = redis.call('LRANGE', queue_key, 0, -1)
for i, item in ipairs(items) do
    local isep = string.find(item, '|', 1, true)
    local item_user = string.sub(item, 1, isep - 1)
    local item_token = string.sub(item, isep + 1)
    if item_user == user_id then
        return {'queued', tostring(i), item_token}
    end
end

redis.call('RPUSH', queue_key, user_id .. '|' .. hold_token)
redis.call('HSET', holdmeta_key, 'sig', sig, 'user_id', user_id)
redis.call('EXPIRE', holdmeta_key, holdmeta_ttl)
local position = redis.call('LLEN', queue_key)
return {'queued', tostring(position), hold_token}
"""

# KEYS[1] = hold_key, KEYS[2] = queue_key, KEYS[3] = holdmeta_key (confirming holder's own)
# ARGV[1] = expected_holder_value ("user_id:hold_token")
_CONFIRM_AND_RELEASE = """
local hold_key = KEYS[1]
local queue_key = KEYS[2]
local holdmeta_key = KEYS[3]
local expected = ARGV[1]

local current = redis.call('GET', hold_key)
if current ~= expected then
    return {'invalid'}
end

redis.call('DEL', hold_key)
redis.call('DEL', holdmeta_key)
local queued = redis.call('LRANGE', queue_key, 0, -1)
redis.call('DEL', queue_key)

return {'confirmed', unpack(queued)}
"""

# KEYS[1] = hold_key, KEYS[2] = queue_key
# ARGV[1] = expected_holder_value, ARGV[2] = ttl_seconds, ARGV[3] = now_ts
#
# Used both for TTL-driven expiry (called by the Celery task at the hold's
# eta) and for an explicit user-initiated early release — the two cases are
# handled by the same script because the only real difference is *who*
# calls it and *when*; the expected-holder guard makes a stale/duplicate
# invocation (e.g. an expiry task firing after the holder already released
# early, or after they confirmed and someone else already holds the slot)
# a safe no-op either way.
_EXPIRE_OR_RELEASE_AND_PROMOTE = """
local hold_key = KEYS[1]
local queue_key = KEYS[2]
local expected = ARGV[1]
local ttl_seconds = tonumber(ARGV[2])
local now_ts = tonumber(ARGV[3])

local current = redis.call('GET', hold_key)
if current ~= false and current ~= expected then
    return {'stale'}
end

redis.call('DEL', hold_key)

local next_item = redis.call('LPOP', queue_key)
if not next_item then
    return {'drained'}
end

local sep = string.find(next_item, '|', 1, true)
local new_user_id = string.sub(next_item, 1, sep - 1)
local new_hold_token = string.sub(next_item, sep + 1)
local new_holder_value = new_user_id .. ':' .. new_hold_token
redis.call('SET', hold_key, new_holder_value, 'EX', ttl_seconds)
local expires_at = now_ts + ttl_seconds
local remaining = redis.call('LLEN', queue_key)

return {'promoted', new_user_id, new_hold_token, tostring(expires_at), tostring(remaining)}
"""


def _script(name, source):
    scripts = _scripts.setdefault(id(get_client()), {})
    if name not in scripts:
        scripts[name] = get_client().register_script(source)
    return scripts[name]


# ---------------------------------------------------------------------------
# Public result types
# ---------------------------------------------------------------------------

@dataclass
class ReserveResult:
    status: Literal['held', 'queued']
    hold_token: str
    expires_at: Optional[float] = None
    position: Optional[int] = None


@dataclass
class ConfirmResult:
    status: Literal['confirmed', 'invalid']
    released_queue: list = field(default_factory=list)  # list of (user_id, hold_token)
    sig: Optional[str] = None


@dataclass
class ReleaseResult:
    status: Literal['promoted', 'drained', 'stale']
    new_user_id: Optional[str] = None
    new_hold_token: Optional[str] = None
    expires_at: Optional[float] = None
    remaining: Optional[int] = None


@dataclass
class HoldStatus:
    found: bool
    status: Optional[Literal['held', 'queued']] = None
    position: Optional[int] = None
    expires_at: Optional[float] = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def reserve_slot(box_id, date, start_time, duration, user_id, ttl_seconds=None) -> ReserveResult:
    """Atomically claim a slot, or join its FIFO wait queue if it's taken.

    A fresh hold_token is proposed on every call, but the Lua script may
    hand back a *different*, pre-existing token instead (see the script's
    idempotency comment) — always trust its returned token, not the one
    generated here.
    """
    ttl_seconds = ttl_seconds or settings.RESERVATION_HOLD_TTL_SECONDS
    sig = slot_signature(box_id, date, start_time, duration)
    candidate_token = uuid.uuid4().hex
    script = _script('try_acquire_or_enqueue', _TRY_ACQUIRE_OR_ENQUEUE)
    status, second, actual_token = script(
        keys=[_hold_key(sig), _queue_key(sig), _holdmeta_key(candidate_token)],
        args=[user_id, candidate_token, ttl_seconds, time.time(), sig, HOLDMETA_TTL_SECONDS],
    )
    if status == 'held':
        return ReserveResult(status='held', hold_token=actual_token, expires_at=float(second))
    return ReserveResult(status='queued', hold_token=actual_token, position=int(second))


def confirm_reservation(hold_token, user_id) -> ConfirmResult:
    """Finalize a held slot. Caller must then write the real Booking row —
    this only clears Redis state and reports who was waiting behind it so
    they can be told the slot is gone (not promoted; it's permanently taken)."""
    meta = get_holdmeta(hold_token)
    if meta is None or meta['user_id'] != str(user_id):
        return ConfirmResult(status='invalid')
    sig = meta['sig']
    expected = f"{user_id}:{hold_token}"
    script = _script('confirm_and_release', _CONFIRM_AND_RELEASE)
    reply = script(
        keys=[_hold_key(sig), _queue_key(sig), _holdmeta_key(hold_token)],
        args=[expected],
    )
    if reply[0] == 'invalid':
        return ConfirmResult(status='invalid')
    released = []
    for item in reply[1:]:
        uid, _, token = item.partition('|')
        released.append((uid, token))
    return ConfirmResult(status='confirmed', released_queue=released, sig=sig)


def release_hold(hold_token, ttl_seconds=None) -> ReleaseResult:
    """Give up a held slot (whether by explicit user action or TTL expiry)
    and promote the next queued user, if any. Safe to call on a hold that's
    already gone (already confirmed, already promoted away, etc.) — becomes
    a no-op ('stale')."""
    ttl_seconds = ttl_seconds or settings.RESERVATION_HOLD_TTL_SECONDS
    meta = get_holdmeta(hold_token)
    if meta is None:
        return ReleaseResult(status='stale')
    sig = meta['sig']
    expected = f"{meta['user_id']}:{hold_token}"
    script = _script('expire_or_release_and_promote', _EXPIRE_OR_RELEASE_AND_PROMOTE)
    reply = script(
        keys=[_hold_key(sig), _queue_key(sig)],
        args=[expected, ttl_seconds, time.time()],
    )
    status = reply[0]
    if status == 'promoted':
        new_user_id, new_hold_token, expires_at, remaining = reply[1:]
        return ReleaseResult(
            status='promoted',
            new_user_id=new_user_id,
            new_hold_token=new_hold_token,
            expires_at=float(expires_at),
            remaining=int(remaining),
        )
    return ReleaseResult(status=status)


# expire_hold is release_hold under a different name at the call site —
# same operation, called by the Celery expiry task instead of a user action.
expire_hold = release_hold


def get_queue_position(hold_token) -> Optional[int]:
    status = get_hold_status(hold_token)
    if status.found and status.status == 'queued':
        return status.position
    return None


def get_hold_status(hold_token) -> HoldStatus:
    """Always re-derives status from the hold/queue keys themselves rather
    than trusting any cached state, so a stale holdmeta entry can never
    report a status that no longer matches reality."""
    meta = get_holdmeta(hold_token)
    if meta is None:
        return HoldStatus(found=False)
    sig = meta['sig']
    user_id = meta['user_id']
    expected = f"{user_id}:{hold_token}"
    client = get_client()

    holder_value = client.get(_hold_key(sig))
    if holder_value == expected:
        pttl = client.pttl(_hold_key(sig))
        expires_at = time.time() + (pttl / 1000 if pttl and pttl > 0 else 0)
        return HoldStatus(found=True, status='held', position=0, expires_at=expires_at)

    items = client.lrange(_queue_key(sig), 0, -1)
    needle = f"{user_id}|{hold_token}"
    if needle in items:
        return HoldStatus(found=True, status='queued', position=items.index(needle) + 1)

    return HoldStatus(found=False)


def get_holdmeta(hold_token):
    """Public reverse lookup from hold_token -> {sig, user_id}. Exposed (not
    prefixed) because views need it directly for authorization checks (e.g.
    confirming the caller actually owns a hold_token before acting on it)."""
    data = get_client().hgetall(_holdmeta_key(hold_token))
    if not data:
        return None
    return data
