# Admin Features

Everything an admin (`role='admin'`) can do in BoxNplay today, via
`pages/AdminDashboard.jsx` and its tabs (Overview / Box Approvals /
Verifications / Users / Bookings / Reviews / Payouts / Coupons / Rewards /
Commission / Analytics / Reports / Activity Log). Endpoint paths are
relative to `/api/`.

## Contents

1. [Box approvals](#box-approvals)
2. [Owner verification review](#owner-verification-review)
3. [User management](#user-management)
4. [Platform-wide bookings](#platform-wide-bookings)
5. [Review moderation](#review-moderation)
6. [Payouts](#payouts)
7. [Coupons](#coupons)
8. [Rewards system control](#rewards-system-control)
9. [Commission control](#commission-control)
10. [Analytics](#analytics)
11. [Reports](#reports)
12. [Activity log (audit trail)](#activity-log-audit-trail)
13. [Contact-Us submissions — a gap worth knowing about](#contact-us-submissions--a-gap-worth-knowing-about)
14. [Notification administration — does not exist](#notification-administration--does-not-exist)

---

## Box approvals

`GET /boxes/admin/pending/` lists every box awaiting review. Each card
shows a verification badge for the owner (informational context —
**it does not gate approval**; an unverified owner's box can still be
approved). Three actions:

- **Approve** — `POST /boxes/admin/{id}/approve/`. The box becomes
  publicly visible/bookable.
- **Reject** — `POST /boxes/admin/{id}/reject/`, reason optional.
- **Request changes** — `POST /boxes/admin/{id}/request-changes/`,
  reason **required**. Sets the box to `changes_requested` and notifies
  the owner; see `docs/OWNER_FEATURES.md`'s "request-changes flow"
  section for what the owner does with it (edit the box, which
  auto-resubmits it).

Every action is written to the audit log (see below).

## Owner verification review

`components/verification/AdminVerificationTab.jsx` — a review queue of
pending KYC submissions (`GET /user/admin/verifications/pending/`, PAN,
GST, uploaded document link, submission date):

- `POST /user/admin/verifications/{id}/approve/`
- `POST /user/admin/verifications/{id}/reject/` (reason required; the
  owner can resubmit after a rejection)

## User management

Full CRUD, with a genuine hard delete — this is the one place in the app
where data is actually, permanently removed rather than soft-flagged.

- **List**: `GET /user/users/`, paginated, searchable, filterable by
  role/active status.
- **View**: read-only detail modal.
- **Edit**: `PATCH /user/users/{id}/admin-update/` — role, active/
  suspended status, and profile fields (name, phone, business name,
  location, plus a few `UserProfile` fields like address/DOB/bio).
  Self-editing is disabled in the UI (an admin can't edit their own
  account through this screen).
- **Suspend**: not a separate action — it's the same edit modal, setting
  status to "Suspended (cannot log in)" (`is_active: false`).
- **Create**: `POST /user/users/create/` — role user/owner/admin. If no
  password is given, the new account gets a password-setup email instead
  of a blank/unusable password.
- **Delete (real, hard delete)**: a two-step, deliberately friction-full
  flow. `GET /user/users/{id}/delete-preview/` first shows exactly what
  will be affected (booking count, review count, and for an owner: box
  count, payout records, commission overrides); the admin must then type
  the user's exact email to confirm before `DELETE /user/users/{id}/delete/`
  actually runs. Cascade behavior: the user's own bookings, reviews,
  payouts, and commission overrides are deleted along with them; but if
  they're an owner, **their boxes are not deleted** — box ownership is
  set to null (`SET_NULL`), so the boxes themselves stay live and
  bookable, just ownerless. Self-deletion is disabled.

## Platform-wide bookings

`GET /bookings/admin/` — every booking on the platform, paginated,
filterable by status and date range, searchable. Clicking a row opens a
read-only detail view (customer, box, owner, amounts, commission, source
— online vs. owner walk-in, cancellation reason if any). For a
`Confirmed` booking, **"Cancel & refund"** is available
(`POST /bookings/{id}/cancel/`, reason required) — the UI states plainly
that the customer will be refunded (if wallet balance was used) and
notified; this is the same underlying cancellation logic used everywhere
else in the app, just admin-initiated.

## Review moderation

`GET /boxes/admin/reviews/` — every review platform-wide, paginated,
searchable, sortable. **Delete**
(`DELETE /boxes/admin/reviews/{id}/`, confirmation required) is the only
moderation action — there's no edit/hide, only removal. The affected
box's average rating is recomputed immediately after a delete.

## Payouts

Two distinct admin capabilities, both **record-keeping only** — neither
one moves real money. There is no payment/bank-transfer API integration
anywhere in this app; the actual transfer happens outside BoxNplay, and
these screens exist to keep an accurate ledger of what's owed and what's
been paid.

- **Record a manual payout** — `POST /owner_dashboard/payouts/`
  (`owner`, `amount`, `note`, `payment_method`, `transaction_id`). The
  modal shows the owner's payout destination on file (bank/UPI, from
  `docs/OWNER_FEATURES.md`'s payout-details section, read-only here) and
  warns — without blocking — if the amount exceeds the computed balance
  due, since an intentional overpayment correction is a legitimate use
  case.
- **Set a payout schedule** — `POST`/`PATCH /owner_dashboard/payout-schedules/`
  (frequency: weekly/biweekly/monthly, plus a day-of-week or
  day-of-month). This is the config the daily
  `run_scheduled_payouts_task` Celery Beat job actually reads to decide
  when to auto-generate a `scheduled`-source payout record for an owner
  — see `docs/SCALABILITY_QA_GUIDE.md` for the process-model requirement
  (Beat must actually be running for this to fire) and
  `docs/OWNER_FEATURES.md` for what the owner sees. An owner can view
  their own schedule but only an admin can change it.
- **Balance/history views** (`GET /owner_dashboard/payouts/balance/`,
  `GET /owner_dashboard/payouts/`) — the same per-owner gross/commission/
  net/paid/due breakdown (with a per-sport split) that owners see for
  themselves, here aggregated across every owner on the platform.

## Coupons

`GET/POST /bookings/admin/coupons/` — platform-wide discount codes (code,
percent-or-flat discount, optional validity window, optional max-use
cap). Once created, a coupon can only be **activated/deactivated**
(`PATCH .../{id}/ {active}`) — there's no editing its value or deleting
it outright.

## Rewards system control

`components/rewards/AdminRewardsTab.jsx`, five sub-tabs — this is where
the entire platform-wide rewards economy is configured:

- **Overview** (`GET /rewards/admin/overview/`) — outstanding wallet
  liability across every user (i.e. the platform's total unredeemed
  reward exposure), total cashback/scratch-card/spin-wheel value paid out
  to date, redeem-code value issued vs. actually redeemed, and the top
  wallet balances platform-wide.
- **Cashback** (`GET/POST /rewards/admin/cashback-rules/`) — percent,
  optional cap, and a minimum booking amount to qualify. Only one rule is
  ever active at a time — creating a new active rule automatically
  deactivates whichever one was active before, rather than allowing
  multiple simultaneously-active rules to stack or conflict.
- **Scratch Cards** — prize-tier CRUD (label, prize amount, relative
  odds/weight, active toggle), plus the **platform-wide master switch**
  (`GET/PATCH /rewards/admin/scratch-cards/auto-grant/`) that overrides
  every individual owner's own auto-grant setting when turned off — an
  owner opting in has no effect if this platform switch is off. Also a
  manual "grant to any user" action, same mechanism as the owner-level
  one but not limited to that owner's own customers.
- **Spin Wheel** — prize-segment CRUD (label, prize amount, odds/weight,
  color, display order). No platform-wide on/off switch exists for spins
  the way there is for scratch cards — a spin entitlement is granted
  unconditionally on every booking completion.
- **Redeem Codes** — platform-wide (not box-scoped) bulk code generation
  (`POST /rewards/admin/redeem-codes/generate/`: value, quantity, batch
  label, optional expiry) plus a CSV export of generated batches. These
  are the codes redeemable directly into a player's wallet (see
  `docs/PLAYER_FEATURES.md`) — distinct from the box-scoped promo codes
  owners generate for their own checkout discounts.

## Commission control

`components/commission/AdminCommissionTab.jsx` — both a global fallback
and per-owner-per-sport overrides, in one place:

- **Platform default rate** (`GET/PATCH /boxes/admin/commission-default/`)
  — a single global percentage applied to any booking whose owner/sport
  combination has no specific override.
- **Per-owner-per-sport overrides**
  (`GET/POST /boxes/admin/commission-rates/`: owner, sport, rate,
  effective-from date) — these are **append-only and versioned**, never
  edited in place: changing a rate creates a new row with a new
  effective-from date rather than mutating the existing one, specifically
  so a past booking's commission is never silently rewritten after the
  fact. The table shows every historical rate with the current one
  badged.
- **Commission report** — the same by-sport balance breakdown surfaced
  on the Payouts tab, here with a CSV export, letting an admin audit
  exactly what commission rate applied to each owner's revenue by sport.

## Analytics

Read-only, sourced from one aggregated payload
(`GET /user/admin-dashboard/`): peak booking hours, month-over-month
revenue and booking growth, cancellation rate, top boxes and top owners
by revenue, and a platform-wide status snapshot (total users, active
boxes, total bookings, resolved commission — all computed from real data,
not hardcoded placeholders).

## Reports

CSV exports built client-side from data already fetched elsewhere in the
dashboard (there's no dedicated backend reporting endpoint): a revenue
report, a user-analytics report, a booking report, and a performance
report (combined top boxes + top owners).

**Two report types are explicitly disabled placeholders, not silently
half-built** — worth knowing so nobody goes looking for them expecting
them to work:
- **Security report** — hard-disabled, with an in-code comment noting it
  would need a dedicated security-event log that doesn't exist (the
  general admin Activity Log below is a different thing — an audit trail
  of admin actions, not a security-event feed).
- **Custom report** — hard-disabled; an open-ended report builder was
  scoped as its own separate feature and was never built.

## Activity log (audit trail)

`components/admin/AdminActivityLogTab.jsx`,
`GET /user/admin/action-log/` — a read-only, paginated, filterable audit
trail of admin actions: timestamp, which admin performed it, an
action-type badge (e.g. `user.update`, `user.create`, `user.delete`,
`box.approve`, `box.reject`, `box.request_changes`, `payout.record`),
the target object, and an expandable JSON blob of the specific details
recorded for that action. Every admin mutation described in this
document that has real consequences (user edits/creates/deletes, box
approve/reject/request-changes, payout recording) writes an entry here.

## Contact-Us submissions — a gap worth knowing about

The public Contact page (`POST /api/contact/`) saves every submission to
the database **and** emails it to the support inbox via Resend. But
**there is no admin-facing screen anywhere in the Admin Dashboard to
view, search, or manage these submissions** — no tab, no table. The only
way to review a contact submission after the fact is through the Django
admin site directly (`ContactSubmission` is registered there,
read-only), not through the app's own admin UI. If "handling" contact
submissions is expected to mean triaging them in-app, that doesn't exist
today — it's inbox-and-email only.

## Notification administration — does not exist

Worth stating plainly rather than leaving as an assumed feature: **there
is no way for an admin to compose, send, or broadcast a notification to
users from anywhere in the Admin Dashboard.** The only notification-
related UI anywhere in the app is the player/owner-facing
`NotificationBell` (read/mark-as-read for one's own notifications, see
`docs/PLAYER_FEATURES.md`). Every notification in the system is
generated automatically as a side effect of some other action (a booking
event, a box status change, a verification result, a payout being
recorded, and so on) — there is no manual-send or broadcast capability,
and no admin screen listing all notifications platform-wide.
