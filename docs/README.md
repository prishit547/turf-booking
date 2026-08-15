# Docs index

## Start here

- **[APPLICATION_OVERVIEW.md](APPLICATION_OVERVIEW.md)** — what BoxNplay
  is, the three user roles, and pointers to the rest of this set plus the
  repo's architecture docs.
- **[PLAYER_FEATURES.md](PLAYER_FEATURES.md)** — everything a player can
  do: browsing/booking, the live slot reservation system, checkout
  (payment is demo-only — bookings are pay-at-venue), recurring bookings,
  coupons, waitlist, cancellation/refund, reschedule, reviews,
  notifications, wallet and rewards, gamification, profile.
- **[OWNER_FEATURES.md](OWNER_FEATURES.md)** — everything a facility
  owner can do: box CRUD, blocked dates, pricing rules, dashboard
  analytics, bookings/no-show management, walk-in bookings and slot
  preemption, payouts and commission, rewards control, KYC/verification.
- **[ADMIN_FEATURES.md](ADMIN_FEATURES.md)** — everything an admin can
  do: box approvals, user management (including a real hard delete),
  platform-wide bookings, review moderation, payouts, coupons, the
  rewards system, commission, analytics/reports, the audit log — and two
  explicitly-documented gaps (no in-app Contact-Us inbox, no admin
  notification-broadcast tool).

These three feature docs are current as of this writing and are the
canonical description of what the app does today. If behavior drifts
from what they describe, trust the code and update the doc — don't leave
it stale, per the note at the bottom of this file.

## Architecture and concurrency deep-dives

- **[ATOMICITY_DOCUMENTATION.md](ATOMICITY_DOCUMENTATION.md)** — the
  actual booking-concurrency model: a Redis-backed, Lua-scripted
  hold/wait-queue engine (`bookings/reservation.py`) delivering live
  holds/countdowns/queue positions over WebSockets, backed by a
  database-level safety net that remains authoritative independent of
  Redis. Rewritten from scratch — the previous version described a
  DB-level `unique_together` constraint that no longer exists in that
  form and predated this system entirely.
- **[SCALABILITY_QA_GUIDE.md](SCALABILITY_QA_GUIDE.md)** — an interview-
  prep-style Q&A on the app's infrastructure, rewritten so every answer
  is true of the current codebase: what's verified against real
  PostgreSQL/Redis/Docker infrastructure, what caching actually exists,
  the real production process model, and — stated plainly rather than
  hidden in caveats — what genuinely isn't implemented yet (monitoring,
  read replicas, a load balancer, microservices). Cross-check anything
  load-bearing against
  [`backend/BookMyBox/DEPLOYMENT.md`](../backend/BookMyBox/DEPLOYMENT.md),
  which remains the more authoritative, continuously-maintained source
  for deployment specifics.

## Feature-specific implementation notes

- **[CHATBOT_SETUP.md](CHATBOT_SETUP.md)** — setup instructions for the
  Gemini-powered chatbot (API key, environment variables). Re-verified
  against the current `chatbot/views.py` — env var name, setup steps, and
  the model used are all current, with a few technical details (rate
  limiting, error-handling behavior) added since the original version.
- **[CHATBOT_COMPLETE.md](CHATBOT_COMPLETE.md)** — a point-in-time
  implementation summary of the chatbot feature. Re-verified against
  current code and still accurate in substance; treat it as historical
  "why it was built this way" context rather than a live spec — for
  anything load-bearing, check `chatbot/views.py` directly.
- **[ERROR_HANDLING_COMPLETE.md](ERROR_HANDLING_COMPLETE.md)** — a
  point-in-time summary of custom error page work. Not re-verified in
  this pass; treat as historical context.

## Other

- **[BoxNplay-Project-Proposal.md](BoxNplay-Project-Proposal.md)** —
  original project proposal/pitch doc, from before the "BoxNplay" name
  existed in some places. Historical only — the app has grown well
  beyond what it describes; see the feature docs above for current
  reality.

---

*Docs describing point-in-time implementation work (the CHATBOT_* and
ERROR_HANDLING_COMPLETE docs) are inherently a snapshot and will drift as
the code keeps changing — that's expected of that document type. The
feature docs (APPLICATION_OVERVIEW, PLAYER/OWNER/ADMIN_FEATURES,
ATOMICITY_DOCUMENTATION, SCALABILITY_QA_GUIDE) are meant to be kept
current — if you change behavior they describe, update them in the same
change rather than letting them go stale again.*
