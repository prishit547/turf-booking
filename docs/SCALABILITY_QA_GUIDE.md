# BoxNplay — Scalability & Infrastructure Q&A

## Status

This document was rewritten to describe what's **actually implemented and
verified today**, not an aspirational roadmap. The previous version was
written before Redis, Celery, Django Channels, or the reservation system
existed in this codebase, and described PostgreSQL/Redis/load-balancing
as future work; all of that now exists and some of it has been verified
against real infrastructure (see `backend/BookMyBox/DEPLOYMENT.md`, which
this doc treats as the source of truth and cross-references rather than
duplicates). Sections describing things that genuinely don't exist yet
(monitoring/APM, read replicas, sharding, microservices, a load balancer)
say so plainly instead of showing hypothetical code for them.

Keep the Q&A format where it still reads well; every answer below is
intended to be true of the current code, not a forward-looking pitch.

---

## Section 1: Architecture

### Q1: What does the current architecture actually look like?

Django 5 + Django REST Framework backend, JWT auth
(`rest_framework_simplejwt`), served over ASGI (not WSGI — see Q7) so it
can handle both normal HTTP and the live slot-reservation WebSocket
traffic in the same process. React 18 + Vite SPA frontend, calling the API
over `axios`. Redis is a **required** runtime dependency, not optional —
it backs four distinct concerns (see Q4). Celery, with both a worker and a
Beat scheduler process, handles the reservation hold-expiry cascade and
two periodic jobs (booking completion, scheduled payouts). PostgreSQL is
the production database; SQLite is a local-dev-only fallback.

This is a genuine increase in moving parts over a plain
Django+SQLite+WSGI setup — four processes (ASGI server, Celery worker,
Celery Beat, Redis) instead of one, plus a real inter-process dependency
on Redis being up. That's the cost of the reservation feature (see
`docs/ATOMICITY_DOCUMENTATION.md`) actually working correctly under
contention — there isn't a way to get hold/queue/cascade behavior without
some out-of-request-cycle scheduling mechanism.

### Q2: What makes it horizontally scalable, and what doesn't yet?

**Does scale horizontally today:**
- Stateless JWT auth means no server-side session affinity is needed
  between requests.
- The ASGI backend can run multiple worker processes within one container
  (`gunicorn ... -k uvicorn.workers.UvicornWorker --workers N`) — verified
  to roughly double sustained throughput at realistic concurrency (see Q7).
- Celery workers can scale out horizontally (multiple worker processes/
  containers consuming the same queue) — Celery Beat explicitly cannot
  (it's a single scheduler that must never run more than once; a separate
  container from the worker in `docker-compose.prod.yml` for exactly this
  reason).
- The frontend is a static build served by nginx — scales independently
  of the backend, trivially cacheable/CDN-able (not currently behind a
  CDN, see Q8).

**Doesn't yet, and is a real, flagged gap** (not a secret — see
`DEPLOYMENT.md`'s "Known limitations" section):
- JWT is stored in browser `localStorage`, not an httpOnly cookie —
  functional either way for horizontal scaling, but an XSS-exposure
  trade-off inherent to the current auth model. A real fix (cookie-based
  SimpleJWT, CSRF handling, CORS credential mode, and a redesigned
  WebSocket auth flow since httpOnly cookies aren't readable by JS to put
  in a WS connection URL) is a real auth-architecture migration, not
  implemented.
- No load balancer / multi-instance deployment is actually configured —
  `docker-compose.prod.yml` runs exactly one `backend` container (with
  `WEB_CONCURRENCY` worker *processes* inside it, not multiple
  *containers*). Running genuinely multiple backend containers behind a
  load balancer would work given the stateless design, but isn't wired up
  in the shipped compose file.

### Q3: What does the database layer actually look like?

`DATABASES` in `BookMyBox/settings.py` is driven by `DATABASE_URL` via
`dj-database-url`. Unset → falls back to SQLite (`db.sqlite3`) for local
dev with zero configuration. Set to a `postgresql://...` URL → Postgres in
production.

**Verified, not aspirational**: this has been run against a real
PostgreSQL 16 instance (via Docker) — all 40+ migrations apply cleanly
with no schema-compatibility issues (`DEPLOYMENT.md`). A documented
`dumpdata`/`loaddata` procedure exists for migrating real SQLite data to
Postgres.

**Not implemented**: read replicas, a `DatabaseRouter`, or any sharding
strategy. There's exactly one database connection target (`default`).
`DB_CONN_MAX_AGE` (env var, default `600`s) is the one real tuning knob
that exists — `settings.py` carries a comment recommending it be set low
(or `0`) unless Postgres's `max_connections` has been tuned for the
connection volume `WEB_CONCURRENCY` worker processes will actually
generate, based on a stress test that exhausted Postgres's default
100-connection limit under ASGI (which, unlike WSGI, can hold more
concurrent connections open per process).

### Q4: What caching actually exists?

One real Redis instance, split across four logical database indices so
these concerns can never collide (`REDIS_URL`, `/0`–`/3`, see the comment
above `CACHES` in `settings.py`):

- **`/0` — Django cache** (`django_redis`). The one place this is
  actually used for response caching today is
  `boxes/views.py::PublicBoxViewSet` — `list`/`retrieve`/`featured`/
  `popular` are wrapped in `cache_page` for a short TTL (on the order of
  15 seconds). A stress test found these the most-hit read endpoints and
  cutting their latency roughly 3–5x. `nearby` (lat/lng radius search) is
  deliberately **not** cached — real GPS coordinates are high-cardinality
  enough as a cache key that caching would mostly consume cache memory
  without hits.
- **`/1` — Channels layer** (`channels_redis`), the WebSocket pub/sub
  backing the slot-reservation broadcasts.
- **`/2` — Celery broker + result backend**.
- **`/3` — Reservation hold/queue state** (`REDIS_RESERVATION_URL`), kept
  on its own logical DB specifically so cache eviction (`/0`) can never
  accidentally touch live hold/queue state.

**Not implemented**: general query-level or fragment caching beyond the
one `PublicBoxViewSet` case above, and no frontend HTTP-cache layer
(no React Query or equivalent — the frontend just re-fetches).

A real, accepted consequence of the 15s cache TTL: a newly-approved or
newly-edited box can take up to that TTL to show up on public listings.
This is the same bounded-staleness trade-off already made elsewhere (the
frontend polls `booked_slots` every 30s rather than getting a push for
every booking change).

### Q5: How are concurrent booking requests actually handled?

See `docs/ATOMICITY_DOCUMENTATION.md` for the full mechanism — summary:
a Redis-backed Lua-scripted hold/wait-queue engine
(`bookings/reservation.py`) gives contended slots a live hold-with-
countdown or FIFO-queue-position UX over a Channels WebSocket, backed by
a database-level safety net (`transaction.atomic()` +
`select_for_update()` + an interval-overlap check + a conditional unique
constraint) that remains the authoritative guarantee against
double-booking independent of the Redis layer.

### Q6: What's the strategy for large datasets / large lists?

- **Pagination**: `REST_FRAMEWORK['DEFAULT_PAGINATION_CLASS'] =
  PageNumberPagination`, `PAGE_SIZE = 100`, applied globally. Several
  admin-facing list endpoints (users, bookings, reviews, action log,
  redeem codes) rely on this plus `django_filters`-backed filtering and
  search rather than returning unbounded lists.
- **Box listings** (`BoxListings.jsx`) take the opposite approach
  deliberately: the frontend fetches the full public box list once and
  does all filtering/sorting/searching client-side, to keep the grid's
  filter/animation interactions instant rather than round-tripping to the
  server on every filter change. This is a real, intentional trade-off
  documented in the frontend code, not an oversight — it works because
  the current box catalog size is small; it would need revisiting (server-
  side filtering + pagination) at a much larger catalog size.
- **Not implemented**: no virtualized/windowed list rendering
  (e.g. `react-window`) was found anywhere in the frontend, no image CDN
  or responsive image pipeline, no database-level composite index audit
  beyond whatever Django's default per-field indexing and the handful of
  explicit `db_index=True`/indexed fields provide.

---

## Section 2: Production Infrastructure (verified)

### Q7: What does the actual production deployment look like?

`docker-compose.prod.yml` (repo root) is the real, current production
topology — six services: Postgres, Redis, the Django backend, a Celery
worker, a Celery Beat scheduler, and the React frontend built and served
by nginx. This has been verified end-to-end, not just written: all
migrations apply cleanly against a real `postgres:16-alpine` container,
the Django cache round-trips through the `redis` service, and a full
reserve → queue → confirm cycle correctly holds a slot, queues a second
user, writes a `Confirmed` booking to Postgres, and drains the queued
user's Redis entry.

**The backend runs on ASGI, not WSGI** — it serves WebSocket traffic
(`/ws/bookings/slot/...`) alongside normal HTTP, which a WSGI server
can't do:
```bash
gunicorn BookMyBox.asgi:application -k uvicorn.workers.UvicornWorker \
  --workers 2 --bind 0.0.0.0:8000 --timeout 60
```
A single ASGI process is one Python process on one core — a stress test
found the backend GIL/CPU-saturated with throughput completely flat
regardless of concurrency (10 through 150 concurrent users all got the
same ~25–30 requests/sec with one worker). Multiple gunicorn worker
processes let concurrent requests actually run in parallel; this roughly
doubled sustained throughput at realistic concurrency (50–150 users) with
no loss of WebSocket functionality. `daphne` (still in `requirements.txt`)
remains a valid single-process alternative if you'd rather keep Daphne —
Channels' own reference server — as the process supervisor, at the cost
of that concurrency ceiling.

**Four processes, not one, are required** for the reservation feature to
work at all (detailed in `DEPLOYMENT.md`'s "Process model" section):
Redis, the ASGI server, a Celery worker (fires the one-shot hold-expiry
checks), and Celery Beat (ticks the two periodic jobs —
`mark_completed_bookings_task` hourly, `run_scheduled_payouts_task`
daily). Without Beat specifically, nothing ever enqueues those two jobs —
bookings never transition out of `Confirmed`, and no rewards ever fire —
even with a healthy, idle worker process running.

Celery's prefork pool defaults `--concurrency` to
`multiprocessing.cpu_count()` — which reads the **host's** CPU count, not
a container's cgroup limit. A stress test found it forking 8 worker
processes (the test host's core count) inside a container capped at a
fraction of one core — each a full Django process sitting at the memory
limit for no throughput benefit. `WEB_CONCURRENCY`/`CELERY_CONCURRENCY`
both default to `2` in the env checklist, tuned for
`docker-compose.stress.yml`'s specific test profile — not a universal
number; size them to whatever CPU is actually allocated to each container.

Deployment mechanics worth knowing (all verified against the real compose
file, not assumed):
- `migrate` runs as its own one-shot service; `backend`/`celery_worker`
  both wait on it (`service_completed_successfully`) so migrations run
  exactly once rather than racing across containers.
- Static and media files are shared Docker volumes mounted into both
  `backend` (writes them) and the frontend nginx container (serves them
  directly at `/static/`/`/media/`) — `django.conf.urls.static` for
  `MEDIA_URL` is a no-op once `DEBUG=False`, so nginx serving the volume
  directly is what actually makes uploaded images reachable in this
  deployment.
- The frontend is built with `VITE_API_BASE_URL=/api` (relative), so it
  calls the same origin nginx serves from, which nginx proxies to
  `backend:8000` — this sidesteps CORS entirely for the deployed stack.
  Vite inlines `VITE_*` vars at build time, so changing this needs an
  image rebuild, not a runtime env change.
- `SECURE_SSL_REDIRECT` defaults `True` whenever `DEBUG=False`, correct
  once a real TLS terminator sits in front of the stack — but the shipped
  `frontend/nginx.conf` only listens on plain `:80` with no certs.
  `.env.docker.example` explicitly overrides this to `False` for that
  reason; a real deployment with its own TLS termination (cloud load
  balancer, managed ingress, or nginx with real certs) should remove that
  override.

### Q8: What about static assets, media, and a CDN?

**Static files** (Django admin CSS, DRF browsable API assets, the
jazzmin admin theme): served by `whitenoise` directly from the Django
process — real, works today, no separate static-file server needed for a
first production deploy.

**Media files (user-uploaded box/review images)**: **not solved**, and
explicitly flagged as such in `DEPLOYMENT.md` rather than left silently
broken. The current setup is `MEDIA_ROOT`-based local disk storage, which
doesn't work reliably on most production platforms (ephemeral or
non-shared filesystems mean uploaded images can vanish on redeploy or be
invisible to other instances). In the Docker Compose deployment
specifically, a shared volume between `backend` and the frontend's nginx
papers over this for a single-host deployment — but it is still local
disk, not durable object storage, and would not survive a multi-host or
managed-platform deployment. Wiring up real object storage
(`django-storages` + S3, Cloudinary, or similar) needs real cloud
credentials that don't exist in this environment and hasn't been done.

**No CDN** is configured anywhere for static or media assets today.

### Q9: What monitoring/observability actually exists?

**None is currently wired up.** No APM, no request-timing middleware, no
structured metrics export, no error-tracking service (Sentry or
equivalent) integration was found anywhere in the settings or app code.
The stress-test findings quoted throughout this document (throughput
numbers, connection-pool exhaustion, Celery concurrency behavior) came
from one-off manual stress-test runs during development, not from any
always-on monitoring the running application produces. This is a real,
current gap, not a deferred nice-to-have described elsewhere as done.

---

## Section 3: Known limitations (accepted, not accidental)

Carried over verbatim in substance from `DEPLOYMENT.md`'s "Known
limitations" section — repeated here because they're directly relevant to
any scalability/production-readiness conversation about this app:

- **Media storage** needs object storage before a real multi-host
  production launch (Q8).
- **No online payments** — bookings are pay-at-venue by design; there is
  no payment gateway integration anywhere in the app (see
  `docs/PLAYER_FEATURES.md`'s Checkout section for the frontend-side
  detail — the payment-method selector is presentational only).
- **Cross-signature slot overlap** — the Redis reservation layer scopes
  contention to an exact `(box, date, start_time, duration)` signature; a
  same-box-and-start-time request with a *different* duration gets an
  independent hold/queue with no mutual awareness. The database-level
  safety net remains authoritative and will still correctly reject the
  losing booking — this is a UX gap for one specific edge case, not a
  correctness bug. See `docs/ATOMICITY_DOCUMENTATION.md` for the full
  writeup.
- **JWT in `localStorage`, not an httpOnly cookie** — flagged, not fixed
  (Q2).
- **`react-router-dom` one major version behind on security patches** —
  the installed `6.30.4` is the newest 6.x release; the CVEs `npm audit`
  flags for it are patched only in `7.18.0+`. The SSR-only CVE doesn't
  apply to this pure client-rendered SPA; the open-redirect CVE is real
  but narrow (only matters if user-controlled input is ever passed
  verbatim into `<Link to>`/`useNavigate`, which the app doesn't
  currently do). Upgrading is a v6→v7 major migration, not a patch bump.

## Section 4: What's genuinely not implemented (and not currently planned)

Said plainly, once, rather than scattered as caveats: there is no
microservices split, no event sourcing / saga pattern, no database
sharding, no read replicas, no message-queue-based inter-service
communication, and no load balancer in front of multiple backend
instances. The architecture is a single Django monolith (ASGI, with
multiple worker *processes* inside one container) plus Redis plus Celery
— appropriate for the app's current real scale, with a genuinely clear
incremental path (more `WEB_CONCURRENCY`, more Celery workers, Postgres
connection pooling, a real load balancer in front of multiple backend
containers) if load ever demands it, but none of those next steps have
been built, and there's no committed timeline for them.
