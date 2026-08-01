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

```bash
cd frontend
npm install
npm run dev
```

## Other top-level pieces

- [`docs/`](docs) — project documentation, including some historical docs
  from earlier in the project (see [`docs/README.md`](docs/README.md) for
  an index — a couple are flagged as stale, read that first).
- `docker-compose.yml` — a disposable local Redis instance for the backend
  (`docker compose up -d redis`).
- `.github/workflows/ci.yml` — lints/tests both subsystems on push (backend
  Django tests against a Redis service container; frontend lint, vitest,
  and a production build).
