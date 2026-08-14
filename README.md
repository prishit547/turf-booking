# BookMyBox

A turf/sports-box booking platform: browse facilities, book a slot, and —
for contended slots — get a short-lived reservation hold with a live
countdown, or a fair FIFO queue position if someone else already holds it.

This is a two-subsystem monorepo:

## [`backend/`](backend/BookMyBox) — Django REST API

Django 5 + Django REST Framework, JWT auth, PostgreSQL (SQLite for local
dev), Redis-backed slot reservations served over Django Channels
WebSockets, and Celery for the reservation-hold expiry/promotion cascade.

Setup, environment variables, the local dev process model (Redis + ASGI
server + Celery worker), and production deployment notes all live in
[`backend/BookMyBox/DEPLOYMENT.md`](backend/BookMyBox/DEPLOYMENT.md).

## [`frontend/`](frontend) — React + Vite SPA

React 18, React Router, Context API for state, Tailwind for styling. See
[`frontend/README.md`](frontend/README.md) for setup.

## Local Development Setup

To run the application locally, follow these steps to spin up both the backend and frontend subsystems.

### 1. Start the Backend

Open a terminal window and navigate to the backend directory:

```bash
cd backend/BookMyBox

# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt

# Spin up the local Redis container (required for caching, Channels, and Celery)
docker compose -f ../../docker-compose.yml up -d redis

# Apply database migrations
python manage.py migrate

# Start the Django development server
python manage.py runserver
```

In a new terminal window, start the Celery worker (required for wait-queue
and slot reservation holds) — **from the repo root**, not from
`backend/BookMyBox`:

```bash
cd backend/BookMyBox && source venv/bin/activate && cd ../..
PYTHONPATH=backend/BookMyBox celery -A BookMyBox worker -l info --concurrency=2
```

In a third terminal window, start Celery Beat the same way — this is what
actually ticks `CELERY_BEAT_SCHEDULE` (`BookMyBox/settings.py`): hourly
booking-completion (`mark_completed_bookings_task`, which is also what
triggers cashback/scratch-card/spin-wheel grants) and the daily
scheduled-payout run. Without this process running, past bookings never
transition out of `Confirmed` locally, even though the worker above is up:

```bash
cd backend/BookMyBox && source venv/bin/activate && cd ../..
PYTHONPATH=backend/BookMyBox celery -A BookMyBox beat -l info
```

**Why the repo root, not `backend/BookMyBox`, and why `PYTHONPATH` instead
of just `cd`:** `backend/BookMyBox/.env` sets `DATABASE_URL=sqlite:///db.sqlite3`
— a relative path resolved against the process's *working directory at
connection time*, not against the settings file's location. The Django dev
server above always runs with cwd = repo root, so it reads the real,
git-tracked `db.sqlite3` there. `cd`ing into `backend/BookMyBox` first (as
you'd naturally do to make plain `celery -A BookMyBox ...` resolve the
`BookMyBox` package) makes Celery instead read-and-write a second,
untracked `backend/BookMyBox/db.sqlite3` — a completely different,
stale database. Everything still starts up looking fine, so this fails
silently: bookings never complete, the worker looks idle, and nothing errors.
Setting `PYTHONPATH` lets `-A BookMyBox` resolve without `cd`ing there,
so both processes stay pointed at the same `db.sqlite3` the API server uses.

### 2. Start the Frontend

Open another terminal window and navigate to the frontend directory:

```bash
cd frontend

# Install package dependencies
npm install

# Start the Vite development server
npm run dev
```

The frontend will run at `http://localhost:5173/`, proxying API requests to the backend at `http://127.0.0.1:8000/`.

---

## Other top-level pieces

- [`docs/`](docs) — project documentation, including some historical docs
  from earlier in the project (see [`docs/README.md`](docs/README.md) for
  an index — a couple are flagged as stale, read that first).
- `docker-compose.yml` — a disposable local Redis instance for the backend.
- `docker-compose.prod.yml` — the full containerized stack for deployment
  (Postgres, Redis, backend, Celery worker, and the frontend built and
  served by nginx). See the "Docker deployment" section in
  [`backend/BookMyBox/DEPLOYMENT.md`](backend/BookMyBox/DEPLOYMENT.md).
- `.github/workflows/ci.yml` — lints/tests both subsystems on push (backend
  Django tests against a Redis service container; frontend lint, vitest,
  and a production build).
