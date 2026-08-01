# Docs index

Historical project documentation, collected here from a previous location
at the repo root (and one from `project/`). Written at various points
earlier in the project's history — **treat anything describing current
behavior with caution and verify against the actual code**, not all of it
has kept pace with later changes (two are flagged explicitly below).

- **BookMyBox-Project-Proposal.md** — original project proposal/pitch doc.
- **CHATBOT_SETUP.md** — setup instructions for the Gemini-powered chatbot
  (getting an API key, environment variables).
- **CHATBOT_COMPLETE.md** — a point-in-time implementation summary of the
  chatbot feature.
- **ERROR_HANDLING_COMPLETE.md** — a point-in-time summary of custom error
  page work.
- **ATOMICITY_DOCUMENTATION.md** ⚠️ — describes booking-concurrency
  guarantees, including a DB-level `unique_together` constraint that was
  later removed (see `backend/BookMyBox/bookings/migrations/0002_*`) and
  predates the Redis-backed reservation/wait-queue system in
  `backend/BookMyBox/bookings/reservation.py`. Confirmed stale — read the
  code, not this doc, for how booking concurrency actually works today.
- **SCALABILITY_QA_GUIDE.md** ⚠️ — an interview-prep-style Q&A about
  scaling the app, written aspirationally (describes infrastructure — e.g.
  PostgreSQL, Redis — that didn't exist in the codebase at the time it was
  written). Some of what it describes exists now, some doesn't, and it
  wasn't updated to reflect either. Cross-check anything load-bearing
  against `backend/BookMyBox/DEPLOYMENT.md`, which is kept current.
