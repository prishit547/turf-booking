# Owner Features

Everything a facility owner (`role='owner'`) can do in BoxNplay today, via
`pages/OwnerDashboard.jsx` and its tabs (Overview / My Boxes / Bookings /
Analytics / Payouts / Rewards / Verification). Endpoint paths are relative
to `/api/`.

A note on where things actually live in the backend, since it's not
obvious from the frontend alone: box CRUD, blocked dates, and pricing
rules live in the `boxes` app; owner bookings/stats/payouts live in
`owner_dashboard`; KYC/verification and bank/UPI payout **destination
details** live in the `user` app; commission rates live in the `boxes`
app. None of this matters for using the feature, but it matters if you're
looking for the code.

## Contents

1. [Box CRUD and operating hours](#box-crud-and-operating-hours)
2. [Blocked dates](#blocked-dates)
3. [Peak/off-peak pricing rules](#peakoff-peak-pricing-rules)
4. [Responding to reviews](#responding-to-reviews)
5. [Dashboard stats and analytics](#dashboard-stats-and-analytics)
6. [Managing bookings, cancellation, and no-shows](#managing-bookings-cancellation-and-no-shows)
7. [Walk-in bookings and slot preemption](#walk-in-bookings-and-slot-preemption)
8. [Payouts and commission](#payouts-and-commission)
9. [Rewards: scratch-card control and box-scoped promo codes](#rewards-scratch-card-control-and-box-scoped-promo-codes)
10. [Identity/business verification (KYC)](#identitybusiness-verification-kyc)
11. [The request-changes flow](#the-request-changes-flow)
12. [Contact/visibility with customers](#contactvisibility-with-customers)

---

## Box CRUD and operating hours

The "My Boxes" tab plus a 4-step wizard
(`components/boxes/AddBoxForm.jsx`: Basic Info → Sports & Pricing →
Details & Images → Review & Submit) covers create and edit for a box:
name, sport(s), location, price, capacity, opening/closing time,
description, amenities, images, rules, and geo-coordinates.

- `GET/POST /boxes/owner/`, `PUT/PATCH/DELETE /boxes/owner/{id}/` —
  scoped to the caller's own boxes.
- A newly-created box is always forced to `status='pending'` — every box
  needs admin approval before it appears publicly (see
  `docs/ADMIN_FEATURES.md`'s Box Approvals section).
- Editing a box that's in `changes_requested` status **automatically
  resubmits it** — saving the edit flips it back to `pending` and clears
  the admin's rejection note, without any separate "resubmit" action.
- Deleting a box is a real cascade delete of that box's entire booking
  history — the confirmation modal says so explicitly, it's not a soft
  hide.
- **Operating hours are a single daily window per box**
  (`opening_time`/`closing_time`, e.g. `06:00`–`23:00`) — there is no
  per-weekday schedule (Monday hours different from Sunday hours isn't
  supported). This is what drives the hourly slot grid players see on
  Box Details.

## Blocked dates

A per-box "Manage blocked dates" modal for whole-day closures (holidays,
maintenance). `GET/POST /boxes/blocked-dates/?box={id}`,
`DELETE /boxes/blocked-dates/{id}/`.

If the date being blocked already has Confirmed bookings, the plain
`POST` is rejected with a `400` and a preview list of the conflicting
bookings (customer, time) rather than silently overriding them. The owner
must explicitly pass `force=true` to proceed, at which point **every
conflicting booking is cancelled** (a real cancellation — real wallet
refund if applicable, real notification — same as any other cancellation)
and the block is created, all inside one all-or-nothing transaction: if
any single cancellation in that batch fails (e.g. one booking is now
within the 2-hour cancellation cutoff), the *entire* batch — including
bookings already cancelled earlier in the same request — rolls back.

## Peak/off-peak pricing rules

A per-box "Manage pricing" modal. `GET/POST /boxes/pricing-rules/?box={id}`,
`DELETE /boxes/pricing-rules/{id}/`. A rule is a **flat replacement
price**, not a multiplier — set for `weekday`, `weekend`, or `all`, plus a
time window and an optional label. Falls back to the box's base flat
price whenever no rule matches a given booking's start time (a
multi-hour booking that straddles a pricing-rule boundary is billed
entirely at its *start time*'s resolved rate — the rule engine matches on
start time only, not a per-hour blend). This is what the player-facing
"price preview" at checkout resolves against.

## Responding to reviews

From `components/boxes/ViewBoxModal.jsx`, an owner can post one public
response per review on their own box:
`PATCH /boxes/owner/{boxId}/reviews/{reviewId}/respond/`. This is the
only way `owner_response` can ever be written — a player can't post it,
and there's no way for an owner to edit or delete a customer's review
itself, only add a reply beneath it.

## Dashboard stats and analytics

- **Overview tab**: `GET /owner_dashboard/stats/` — revenue and booking
  totals, active/pending/rejected box counts, average rating, a 6-month
  revenue trend, a bookings trend, a sports-distribution breakdown, and
  the 5 most recent bookings.
- **Analytics tab** (lazy-loaded): `GET /owner_dashboard/analytics/` —
  30-day occupancy rate (overall and per-box, computed against each
  box's actual opening/closing window), per-box revenue/booking ranking,
  peak booking hours, cancellation rate, and repeat-customer rate.

## Managing bookings, cancellation, and no-shows

The Bookings tab (`GET /owner_dashboard/bookings/`, scoped to the
owner's own boxes, paginated/searchable/filterable) distinguishes
**walk-in bookings** (`booking_source='owner_manual'`, showing the
manually-entered customer name/phone) from **online bookings** (showing
the actual account holder's name, with a phone fallback to their profile
if none was recorded on the booking itself).

- **Cancel** — `POST /owner_dashboard/bookings/{id}/cancel/`, reason
  required. Goes through the same `cancel_booking` logic as a
  player-initiated cancellation: real wallet refund if wallet balance was
  used, and a notification to the customer. Only offered (client-side
  hint) while the booking is still `Confirmed` and more than 2 hours out
  — the server enforces this regardless of what the UI shows.
- **Mark no-show** — `POST /owner_dashboard/bookings/{id}/mark-no-show/`,
  only legal once the booking's start time has actually passed. This is
  deliberately **not** the same as cancelling: it issues **no refund**
  and grants **no rewards** (cashback/scratch-card/spin-entitlement never
  fire for a no-show booking) — this is the rewards-abuse prevention
  mechanism, so a customer can't book, no-show, and still collect
  cashback. A no-show booking also never gets auto-completed by the
  hourly completion job, since that job only touches bookings still in
  `Confirmed` status.

## Walk-in bookings and slot preemption

The "Add booking" button on the Bookings tab lets an owner directly book
a slot on their own box — for a walk-in customer paying cash at the
venue, or to block a slot for maintenance.
`POST /owner_dashboard/bookings/book/` takes `boxId`, `date`,
`startTime`, `duration`, `customerName`, `customerPhone`, and
`paymentStatus` (only `"Not required (block only)"` or `"Completed (cash
collected at venue)"` are accepted — anything else is silently forced to
"not required").

**This takes priority over any customer currently mid-checkout on that
exact slot** — the UI says so plainly. If someone else currently holds
the slot (or is queued for it) via the live reservation system, the
owner's booking **preempts** them: every displaced holder/queued user is
told live (via WebSocket, plus a persisted notification as a fallback)
that the venue reserved the slot and they need to pick another one. See
[`docs/ATOMICITY_DOCUMENTATION.md`](ATOMICITY_DOCUMENTATION.md#owner-preemption-walk-in-bookings)
for the mechanics. The one thing this can never do is override a slot
that already has a real `Confirmed`/`Completed` booking — that returns a
`409`, since a paying customer's already-confirmed booking is never
silently bumped.

## Payouts and commission

The Payouts tab covers three related but distinct things:

- **Payout destination** (`components/payouts/OwnerPayoutDetailsCard.jsx`,
  `GET/PATCH /user/owner/payout-details/`) — bank account holder name,
  account number + IFSC (must be given together, or not at all), and/or
  a UPI ID. This is where the money is supposed to go; **the app never
  actually transfers it** — see below.
- **Balance and commission breakdown**
  (`GET /owner_dashboard/payouts/balance/`) — gross revenue, platform
  commission, net revenue, total already paid, and balance due, computed
  live from the owner's booking history (not a stored running ledger).
  Includes a **per-sport breakdown** (`by_sport`), since commission can
  differ by sport for the same owner — this is where an owner actually
  sees the exact rate applied to each of their sports.
- **Payout history** (`GET /owner_dashboard/payouts/`) — every payout
  record, tagged `scheduled` or `manual`, with payment method and
  transaction ID if recorded.

**Important**: every "payout" in this system, scheduled or manual, is a
**record-keeping entry**, not a live money transfer — there is no
integration with a real payment/bank-transfer API anywhere in the app.
An admin marks a payout as having happened (see
`docs/ADMIN_FEATURES.md`); the actual transfer happens outside BoxNplay
entirely. The payout *schedule* itself (frequency: weekly/biweekly/
monthly) is visible to the owner here but can only be **set by an
admin** — an owner can see their own schedule but can't change its
cadence.

Commission itself — the rate applied per booking — is set entirely by
admins (global default, or a per-owner-per-sport override); owners have
no control over their own commission rate, only visibility into it.

## Rewards: scratch-card control and box-scoped promo codes

`components/rewards/OwnerRewardsTab.jsx`, two sub-tabs:

- **Scratch Cards** — a per-owner auto-grant toggle
  (`GET/PATCH /rewards/owner/scratch-cards/auto-grant/`): whether
  completing a booking on *this owner's* boxes automatically grants the
  customer a scratch card. This has no effect if the platform-wide
  admin master switch is off (admin setting always wins). Owners can
  also manually gift a scratch card to any user by searching for them
  (`POST /rewards/owner/scratch-cards/grant/`) — the prize amount is
  still drawn randomly from the platform's configured prize tiers, an
  owner can't choose the payout.
- **Promo Codes** — box-scoped discount codes, distinct from admin
  redeem codes: these apply only as a checkout discount on a specific
  box, never as a direct wallet credit.
  `GET /rewards/owner/redeem-codes/?box_id=`,
  `POST /rewards/owner/redeem-codes/generate/` (value, quantity, batch
  label) bulk-generates a batch. Requires the owner to have at least one
  box.

## Identity/business verification (KYC)

`components/verification/OwnerVerificationTab.jsx` — explicitly optional
(not gated behind any other feature). Submits PAN number, GST number, and
a supporting document (`GET/POST /user/owner/verification/`, multipart).
Status progression: `not_submitted` → `pending` → `approved` or
`rejected` (rejected shows the admin's reason and allows resubmission).
This status is what feeds the small verification badge admins see next
to an owner's name on the Box Approvals tab — it's informational context
for admin review, not a hard gate on whether a box can be approved.

## The request-changes flow

This is worth calling out because the name suggests the owner initiates
it — they don't. **Request-changes is an admin action**, the middle
option (alongside Approve/Reject) on the admin's Box Approvals tab: an
admin can set a box to `changes_requested` with a required reason instead
of an outright rejection. The owner's role in this flow is entirely
passive from the request side: they see the `changes_requested` status
and the admin's note on their box card, and their only available action
is to **edit the box** — there's no separate "acknowledge" or "owner
requests changes" action anywhere. As noted above, saving that edit is
what automatically resubmits the box for another review.

## Contact/visibility with customers

There's no dedicated settings screen for this — it's worth documenting
plainly that it doesn't exist as a configurable feature, only as passive
display. On the Bookings tab, an owner sees whatever contact info is
already attached to a booking: for walk-ins, exactly what the owner
themselves typed in; for online bookings, the customer's name and a
phone number (the booking's own recorded phone if present, otherwise a
fallback to the customer's profile phone). There is no toggle anywhere
in the Owner Dashboard for an owner to control whether *their own*
contact details are visible to customers, or to hide a customer's
contact info from themselves.
