# BookMyBox Backend — Deployment Notes

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
   HTTP, which WSGI can't do. `daphne` is included in `requirements.txt`:
   ```bash
   daphne -b 0.0.0.0 -p 8000 BookMyBox.asgi:application
   ```
   (`gunicorn -k uvicorn.workers.UvicornWorker BookMyBox.asgi:application`
   is an equally valid alternative if you'd rather keep gunicorn as the
   process supervisor — either works, Daphne was chosen here since it's
   Channels' own reference server.)
3. **A Celery worker** — schedules and fires the one-shot hold-expiry checks
   that make the wait-queue cascade (a hold expires -> the next queued user
   is promoted -> their own expiry gets scheduled -> ...). No Celery Beat/
   periodic schedule is needed, just a running worker:
   ```bash
   celery -A BookMyBox worker -l info
   ```

This is a real operational complexity increase over the previous
single-process WSGI setup — three processes instead of one, plus a Redis
dependency. It's the cost of the reservation feature actually working
correctly under contention; there isn't a way to get the hold/queue/
cascade behavior without some out-of-request-cycle scheduling mechanism.

## Environment checklist before deploying

- `DEBUG=False`
- `SECRET_KEY` set to a real, unique value (not the dev key in `.env`)
- `ALLOWED_HOSTS` set to your real domain(s)
- `DATABASE_URL` set to your production PostgreSQL instance
- `CORS_ALLOWED_ORIGINS` set to your real frontend origin(s)
- `REDIS_URL` set to your production Redis instance (see above — required
  now, not optional, for cache/channel-layer/Celery/reservation state)
- `GEMINI_API_KEY` / `GOOGLE_CLIENT_ID` set if those features are needed in production

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
