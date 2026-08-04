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

In a new terminal window, activate the virtual environment and start the Celery worker (required for wait-queue and slot reservation holds):

```bash
cd backend/BookMyBox
source venv/bin/activate
celery -A BookMyBox worker -l info --concurrency=2
```

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
