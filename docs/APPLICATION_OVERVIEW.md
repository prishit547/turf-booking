# BoxNplay — Application Overview

## What this is

BoxNplay is a turf/sports-box booking platform: players browse sports
facilities ("boxes" — turfs, courts, arenas), book an hourly slot, and pay
at the venue (there is no online payment gateway anywhere in the app —
see `docs/PLAYER_FEATURES.md`'s Checkout section). Facility owners list
and manage their own boxes and get paid out by the platform on a schedule,
net of a per-owner-per-sport commission. Admins run the whole platform:
approving boxes, managing users, moderating reviews, controlling the
rewards system, and reviewing an audit log of admin actions.

The Django project package on disk is still literally named `BookMyBox`
(that's intentional — not a rename in progress, just an unfinished
rebrand of the internal package name). The product itself, and everything
user-facing, is BoxNplay.

## The three roles

Every user has exactly one `role` (`user`, `owner`, or `admin` — see
`user/models.py::User`), and the frontend routes them to a
role-specific dashboard after login:

- **Player** (`role='user'`) — the default role for anyone who signs up
  without choosing "list my facility." Browses and books boxes, manages
  their own bookings, wallet, and profile. Detailed in
  [`docs/PLAYER_FEATURES.md`](PLAYER_FEATURES.md).
- **Owner** (`role='owner'`) — lists and manages their own boxes, handles
  their own bookings (including walk-ins), tracks payouts and commission,
  and optionally submits identity/business verification. Detailed in
  [`docs/OWNER_FEATURES.md`](OWNER_FEATURES.md).
- **Admin** (`role='admin'`) — approves/rejects boxes, manages all users
  (including a real hard delete), moderates reviews, controls the
  platform-wide rewards and commission systems, records payouts, and
  reviews an audit log. Detailed in
  [`docs/ADMIN_FEATURES.md`](ADMIN_FEATURES.md).

A role change (e.g. player → owner) requires admin action — a user can't
grant themselves a new role after signup, even via the onboarding flow
(see `user/views.py::complete_onboarding`, which explicitly rejects role
changes).

## Architecture, at a glance

This is a two-subsystem monorepo. For setup, environment variables, the
local dev process model, and production deployment, the canonical source
of truth is:

- [`README.md`](../README.md) (repo root) — quick start for both
  subsystems, and why the Celery worker/Beat commands must be run from
  the repo root, not `backend/BookMyBox`.
- [`backend/BookMyBox/DEPLOYMENT.md`](../backend/BookMyBox/DEPLOYMENT.md)
  — database (SQLite dev / PostgreSQL prod), the four-process model
  (Redis, ASGI server, Celery worker, Celery Beat) required for the live
  reservation feature to work, Docker deployment, and a candid "known
  limitations" section (no online payments, media storage not solved for
  multi-host production, etc.).

In short: Django 5 + Django REST Framework, JWT auth
(`rest_framework_simplejwt`, 90-day refresh-token sessions with silent
rotation), Django Channels over WebSockets for live slot reservation,
Celery (worker + Beat) for the reservation hold-expiry cascade and two
periodic jobs, Redis (required, not optional — cache, channel layer,
Celery broker, and reservation state each get their own logical DB), and
a React 18 + Vite SPA frontend.

## Documents in this set

- **This document** — roles and architecture pointers.
- [`PLAYER_FEATURES.md`](PLAYER_FEATURES.md) — everything a player can do.
- [`OWNER_FEATURES.md`](OWNER_FEATURES.md) — everything a box owner can do.
- [`ADMIN_FEATURES.md`](ADMIN_FEATURES.md) — everything an admin can do.
- [`ATOMICITY_DOCUMENTATION.md`](ATOMICITY_DOCUMENTATION.md) — the
  Redis-backed slot reservation/wait-queue concurrency model in detail.
- [`SCALABILITY_QA_GUIDE.md`](SCALABILITY_QA_GUIDE.md) — what
  infrastructure actually exists today, what's verified, and what's a
  known, accepted gap.
- [`CHATBOT_SETUP.md`](CHATBOT_SETUP.md) / [`CHATBOT_COMPLETE.md`](CHATBOT_COMPLETE.md)
  — the Gemini-powered chatbot widget: setup and a point-in-time
  implementation summary.
- [`README.md`](README.md) — index of this folder.

## Things worth knowing up front, because they cut across every role

- **No payment gateway.** Every booking is pay-at-venue. The Checkout
  page's payment-method selector (UPI/card/wallet icons) is
  presentational only — nothing about which icon is selected is ever
  sent to the backend. The one real form of platform-held money is the
  in-app **wallet** (cashback, scratch cards, spin wheel, redeem codes,
  and real refunds on cancellation all move wallet balance, never a
  payment gateway).
- **Real refunds, but wallet-only.** Cancelling a booking that used
  wallet balance credits that amount straight back to the user's wallet.
  There's nothing else to refund, since nothing else was ever charged
  through the platform.
- **The slot-reservation system is real infrastructure, not a toy.** A
  contended slot gets a genuine Redis-backed hold with a live countdown,
  or a FIFO queue position, pushed over a WebSocket — see
  `ATOMICITY_DOCUMENTATION.md`.
- **Commission is per-owner-per-sport, not a flat platform rate.** Admins
  can set overrides for a specific (owner, sport) pair; anything without
  an override falls back to one platform-wide default rate.
