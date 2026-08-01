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

## Process / WSGI server

`gunicorn` is included in `requirements.txt`. Example run command:

```bash
gunicorn BookMyBox.wsgi:application --bind 0.0.0.0:8000
```

## Environment checklist before deploying

- `DEBUG=False`
- `SECRET_KEY` set to a real, unique value (not the dev key in `.env`)
- `ALLOWED_HOSTS` set to your real domain(s)
- `DATABASE_URL` set to your production PostgreSQL instance
- `CORS_ALLOWED_ORIGINS` set to your real frontend origin(s)
- `GEMINI_API_KEY` / `GOOGLE_CLIENT_ID` set if those features are needed in production

## Known limitations (intentionally out of scope for this pass)

- **Media storage**: see above — needs object storage for real production use.
- **Cache-backed rate limiting**: the chatbot's rate limiter uses Django's cache framework, configured with a `FileBasedCache` (shared across worker processes on one machine). For a genuine multi-machine deployment, switch to Redis (`django-redis`) — not done here since it requires new infrastructure.
- **No online payments**: bookings are pay-at-venue by design (see project README/plan history) — there is no payment gateway integration.
