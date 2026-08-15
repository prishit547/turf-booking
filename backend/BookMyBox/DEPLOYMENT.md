# BoxNplay Backend — Deployment Notes

## Database

`DATABASES` in `BookMyBox/settings.py` is driven entirely by the `DATABASE_URL` environment variable via `dj-database-url`. Local development needs no configuration — it falls back to SQLite (`db.sqlite3`) automatically if `DATABASE_URL` is unset.

For production, set a real PostgreSQL URL:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<dbname>
```

Then run migrations:

```bash
python manage.py migrate
```

This has been verified against a real PostgreSQL 16 instance (via Docker) — all app migrations apply cleanly with no schema-compatibility issues.

### Migrating existing SQLite data to PostgreSQL

If you have real data in `db.sqlite3` that needs to move to Postgres:

```bash
# 1. Dump data from SQLite (excluding content types / permissions, which
#    Django recreates and which can conflict across databases)
python manage.py dumpdata --natural-foreign --natural-primary \
  -e contenttypes -e auth.permission -e admin.logentry -e sessions \
  --indent 2 > data.json

# 2. Point DATABASE_URL at Postgres, run migrations on the empty database
DATABASE_URL=postgresql://... python manage.py migrate

# 3. Load the dumped data
DATABASE_URL=postgresql://... python manage.py loaddata data.json
```

Verify row counts and spot-check a few records after loading — `dumpdata`/`loaddata` is reliable for small-to-medium datasets but is not a substitute for a real backup/restore strategy at scale.

## Static files

`whitenoise` is configured to serve static files (Django admin CSS, DRF browsable API assets, jazzmin theme) directly from the Django process — no separate static file server is required for a first production deploy. Run `python manage.py collectstatic` before starting the app in production.

## Media files (user-uploaded box images)

**Not solved by this pass.** `MEDIA_ROOT`-based local-disk storage (the current setup) does not work reliably in most production environments — most platforms use ephemeral or non-shared filesystems, so uploaded images can vanish on redeploy or be invisible to other instances. Before a real production launch, wire up object storage (e.g. `django-storages` with S3, Cloudinary, or similar). This requires real cloud credentials that don't exist in this environment, so it's intentionally out of scope here — flagging it clearly rather than leaving it silently broken.

## Process model: Redis, ASGI server, and a Celery worker

The slot reservation/wait-queue feature (see `bookings/reservation.py`,
`bookings/tasks.py`, `bookings/consumers.py`) requires three things running
alongside Django, not just one WSGI process:

1. **Redis** — used for the Django cache (`django_redis`), the Channels
   channel layer (WebSocket pub/sub), the Celery broker/result backend, and
   the reservation hold/queue state itself. One physical instance is enough;
   `REDIS_URL` gets split across logical DB indices `/0`-`/3` in
   `settings.py` (see the comment above `CACHES`) so these concerns can never
   collide with each other. A local disposable instance: `docker compose up
   -d redis` (see the `docker-compose.yml` at the repo root).
2. **An ASGI server**, not `gunicorn BookMyBox.wsgi:application` — the app
   now serves WebSocket traffic (`/ws/bookings/slot/...`) alongside normal
   HTTP, which WSGI can't do. `docker-entrypoint.sh` (the Docker deployment's
   default, see below) runs multiple worker processes via gunicorn+uvicorn:
   ```bash
   gunicorn BookMyBox.asgi:application -k uvicorn.workers.UvicornWorker \
     --workers 2 --bind 0.0.0.0:8000 --timeout 60
   ```
   A single ASGI process is one Python process on one core — a stress test
   found the backend GIL/CPU-saturated with throughput completely flat
   regardless of concurrency (10 through 150 concurrent users all got the
   same ~25-30 requests/sec). Multiple worker processes let concurrent
   requests actually run in parallel instead of all queueing behind one
   process; verified this roughly doubled sustained throughput at realistic
   concurrency (50-150 users) with no loss of WebSocket functionality
   (uvicorn's ASGI3 implementation handles the same websocket scope Channels
   needs). `daphne -b 0.0.0.0 -p 8000 BookMyBox.asgi:application` (single
   process, still in `requirements.txt`) remains a valid alternative if
   you'd rather keep Daphne as the process supervisor — Channels' own
   reference server — at the cost of that concurrency ceiling.
3. **A Celery worker** — schedules and fires the one-shot hold-expiry checks
   that make the wait-queue cascade (a hold expires -> the next queued user
   is promoted -> their own expiry gets scheduled -> ...):
   ```bash
   celery -A BookMyBox worker -l info --concurrency=2
   ```
   The explicit `--concurrency` matters: Celery's prefork pool defaults to
   `multiprocessing.cpu_count()`, which reads the *host's* CPU count, not a
   container's cgroup limit — a stress test found it forking 8 worker
   processes (the test host's core count) inside a container capped at a
   fraction of one core, each a full Django process, sitting at the memory
   limit for no throughput benefit. Set it to roughly the CPU actually
   allocated to the container.
4. **A Celery Beat process** — separate from the worker above, this is what
   actually ticks `CELERY_BEAT_SCHEDULE` (`BookMyBox/settings.py`):
   `mark_completed_bookings_task` (hourly — the only code path that ever
   transitions a `Booking` from `Confirmed` to `Completed`, which is also
   what triggers cashback/scratch-card/spin-wheel grants — see
   `rewards/services.py::on_booking_completed`) and
   `run_scheduled_payouts_task` (daily). **A running worker alone is not
   enough** — without Beat also running, nothing ever enqueues these two
   tasks, so bookings stay `Confirmed` forever and rewards never fire, even
   though the worker process is up and idle:
   ```bash
   celery -A BookMyBox beat -l info
   ```
   In Docker, this is the `celery_beat` service in `docker-compose.prod.yml`
   (`docker-entrypoint.sh beat` case) — a separate container from
   `celery_worker`, since Beat is a single scheduler process that must never
   run more than once, unlike the worker which can scale horizontally.

   **Local-dev-only gotcha**: the commands above assume a working directory
   where `DATABASE_URL`'s relative `sqlite:///db.sqlite3` resolves to the
   same file the Django dev server reads (repo root — see the root
   [`README.md`](../../README.md#1-start-the-backend) for the exact
   commands and why plain `cd backend/BookMyBox && celery -A BookMyBox ...`
   silently points at a second, stale, untracked database instead). This
   doesn't apply in Docker, where `DATABASE_URL` is an absolute Postgres URL.

This is a real operational complexity increase over the previous
single-process WSGI setup — four processes instead of one, plus a Redis
dependency. It's the cost of the reservation feature actually working
correctly under contention; there isn't a way to get the hold/queue/
cascade behavior without some out-of-request-cycle scheduling mechanism.

## Docker deployment

`docker-compose.prod.yml` (repo root) packages the whole stack described
above — Postgres, Redis, the Django backend (gunicorn+uvicorn), a Celery
worker, and the React frontend (built and served by nginx) — into six
services. This is
separate from the root `docker-compose.yml`, which only runs a disposable
local Redis for day-to-day dev.

```bash
cp .env.docker.example .env.docker   # fill in real SECRET_KEY, POSTGRES_PASSWORD, etc.
docker compose -f docker-compose.prod.yml --env-file .env.docker up --build -d
```

**Verified against this exact compose file**: all 40+ migrations apply
cleanly against a real `postgres:16-alpine` container; the Django cache
round-trips through the `redis` service; a full reserve → queue → confirm
cycle correctly holds a slot, queues a second user at position 1, writes a
`Confirmed` `Booking` row to Postgres on confirm, and drains the queued
user's Redis entry; the Celery worker receives and would fire the
scheduled `expire_hold_task`.

A few things worth knowing about how this compose file is put together:

- **`migrate` is its own one-shot service**, not something `backend`/
  `celery_worker` do on startup — they both `depends_on: migrate:
  condition: service_completed_successfully`, so migrations run exactly
  once instead of racing between containers.
- **Static and media files are shared volumes**, mounted into both
  `backend` (which writes them) and `frontend`'s nginx (which serves them
  directly at `/static/` and `/media/` — see `frontend/nginx.conf`). This
  isn't just a performance choice: `static(settings.MEDIA_URL, ...)` in
  `urls.py` is a no-op when `DEBUG=False` (Django's own default), so
  nginx serving `/media/` directly from the volume is what actually makes
  uploaded images reachable in this deployment, not a Django route. (The
  media-storage caveat below still applies — this is disk inside the
  Docker host, not durable object storage.)
- **The frontend is built with `VITE_API_BASE_URL=/api`** (relative, not
  absolute) so it calls the same origin nginx is serving from, which nginx
  then proxies to `backend:8000` — see the `/api/`, `/admin/`, and `/ws/`
  `location` blocks in `frontend/nginx.conf`. This sidesteps CORS
  entirely for the deployed stack. Vite inlines `VITE_*` vars at build
  time, so if you need a different value, rebuild the `frontend` image
  (`--build-arg`), don't just change env at runtime.
- **`SECURE_SSL_REDIRECT` defaults to `True` whenever `DEBUG=False`** (see
  `settings.py`), which is correct once something in front of this stack
  actually terminates TLS — but `frontend/nginx.conf` as shipped only
  listens on plain `:80`, with no certs (that needs a real domain, out of
  scope here, same reasoning as the media-storage caveat below). Left at
  its default, the app would 301-redirect every request to an `https://`
  nothing serves, making the whole stack unreachable — confirmed by
  hitting exactly this during verification. `.env.docker.example`
  explicitly sets `SECURE_SSL_REDIRECT=False` for that reason. If you put
  a real TLS terminator (a cloud load balancer, managed ingress, or nginx
  with real certs) in front of this stack, remove that override.
- **If you recreate `backend` alone** (e.g. `up --build backend`) **while
  `frontend` keeps running**, nginx can end up holding a stale
  DNS-resolved IP for the old `backend` container and return 502s until
  `frontend` is restarted too. Recreating the whole stack together (as
  the command above does) doesn't hit this.
- **The public box endpoints (`list`/`retrieve`/`featured`/`popular` on
  `PublicBoxViewSet`) are response-cached for `PUBLIC_BOX_CACHE_TTL` seconds**
  (`boxes/views.py`, default 15s) via Django's Redis-backed cache — a stress
  test found them the most-hit read endpoints, and caching cut their latency
  roughly 3-5x. This means a newly-approved or newly-edited box can take up
  to that TTL to show up publicly; bounded staleness already used elsewhere
  in this app (the frontend polls `booked_slots` every 30s for the same
  reason). `nearby` is deliberately not cached — its cache key would be the
  exact lat/lng query string, and real GPS coordinates are high-cardinality
  enough that caching it would mostly consume cache space without hits.

## Environment checklist before deploying

- `DEBUG=False`
- `SECRET_KEY` set to a real, unique value (not the dev key in `.env`)
- `ALLOWED_HOSTS` set to your real domain(s)
- `DATABASE_URL` set to your production PostgreSQL instance
- `CORS_ALLOWED_ORIGINS` set to your real frontend origin(s)
- `REDIS_URL` set to your production Redis instance (see above — required
  now, not optional, for cache/channel-layer/Celery/reservation state)
- `GEMINI_API_KEY` / `GOOGLE_CLIENT_ID` set if those features are needed in production
- `WEB_CONCURRENCY` / `CELERY_CONCURRENCY` sized to the CPU actually
  allocated to their containers (see "Process model" above) — both default
  to 2, which is tuned for `docker-compose.stress.yml`'s specific profile,
  not a universal number.
- `DB_CONN_MAX_AGE` — 0 is the safe default for constrained/default-tuned
  Postgres (see the comment above `DATABASES` in `settings.py`); raise it
  only once you've either tuned Postgres's `max_connections` for the
  connection volume `WEB_CONCURRENCY` worker processes will generate, or
  put a pooler (PgBouncer) in front of it.

## Known limitations (intentionally out of scope for this pass)

- **Media storage**: see above — needs object storage for real production use.
- **No online payments**: bookings are pay-at-venue by design (see project README/plan history) — there is no payment gateway integration.
- **Cross-signature slot overlap** (`bookings/reservation.py`): the Redis
  hold/queue layer scopes contention to the exact `(box, date, start_time,
  duration)` signature a user requested — two different-duration requests
  for the same box+date+start_time (e.g. 1hr @ 09:00 vs 2hr @ 09:00) get
  independent holds with no mutual queueing awareness. The DB-level
  `transaction.atomic()`+`select_for_update()`+`overlaps()` check in
  `bookings/views.py` remains authoritative and will still correctly reject
  the losing booking at confirm-time — this is a UX gap (a graceful "someone
  else's overlapping booking beat you to it" instead of a queue promotion
  for that specific edge case), not a correctness bug. A v2 could model
  per-box-per-day interval trees in Redis to close this gap; not needed for
  v1 since the frontend only ever offers a fixed set of hourly slot buttons,
  making identical-signature collision the dominant real-world case.
- **JWT stored in `localStorage`, not an httpOnly cookie** (`frontend/src/api.jsx`):
  flagged, not fixed. XSS-exposed by design of the current auth model. The
  real fix (backend cookie-based SimpleJWT config, CSRF token handling for
  mutating requests, CORS `credentials: 'include'` on the frontend, and —
  now that WebSocket auth exists — a redesigned WS-auth flow, since httpOnly
  cookies aren't readable by JS to put in a WS connection URL and WS
  connections can't carry `Authorization` headers) is a real auth-
  architecture migration, not a quick patch. Deferred as a prioritized
  follow-up rather than attempted alongside the reservation feature, which
  already introduced enough new moving parts (Redis, Celery, Channels) in
  one pass.
- **`react-router-dom` is one major version behind on security patches**
  (`frontend/package.json`): the installed `6.30.4` is the newest 6.x
  release, but the two CVEs `npm audit` flags for it (an open-redirect via
  backslash in `<Link>`/`useNavigate`, and an SSR `deserializeErrors`
  constructor-injection issue) are only patched in `7.18.0+`. The SSR issue
  doesn't apply to this pure client-rendered SPA; the open-redirect issue is
  real but narrow (matters only if user-controlled input is ever passed
  verbatim into `<Link to>`/`useNavigate`, which the app doesn't currently
  do). Upgrading is a v6->v7 major migration (React Router v7 changed its
  routing/data APIs substantially) — a real project, not a `npm audit fix`.
