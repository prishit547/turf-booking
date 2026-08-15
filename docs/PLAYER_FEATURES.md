# Player Features

Everything a player (`role='user'`) can do in BoxNplay today. Endpoint
paths are relative to `/api/`. Frontend file paths are relative to
`frontend/src/`.

## Contents

1. [Signup, login, and onboarding](#signup-login-and-onboarding)
2. [Browsing and filtering boxes](#browsing-and-filtering-boxes)
3. [Box details and the live slot reservation system](#box-details-and-the-live-slot-reservation-system)
4. [Checkout — and the payment reality](#checkout--and-the-payment-reality)
5. [Booking confirmation, calendar export, and inviting others](#booking-confirmation-calendar-export-and-inviting-others)
6. [Recurring (weekly) bookings](#recurring-weekly-bookings)
7. [Coupons and redeem codes](#coupons-and-redeem-codes)
8. [Waitlist](#waitlist)
9. [Cancellation and wallet refund](#cancellation-and-wallet-refund)
10. [Reschedule](#reschedule)
11. [Reviews, with photos](#reviews-with-photos)
12. [Notifications](#notifications)
13. [Wallet and rewards](#wallet-and-rewards)
14. [Gamification (achievements, levels)](#gamification-achievements-levels)
15. [Profile management](#profile-management)
16. [Chatbot](#chatbot)
17. [Static/legal pages](#staticlegal-pages)

---

## Signup, login, and onboarding

- **Signup** (`pages/Signup.jsx`) — name, email, password (8-char
  minimum, validated client- and server-side), phone, location, and a
  role choice (`user` or `owner`; owners must also give a business name).
  `POST /user/register/` issues JWT tokens immediately on success — no
  email verification step exists.
- **Login** (`pages/Login.jsx`) — email/password via
  `POST /user/login/`. Rate-limited server-side to 5/min
  (`ScopedRateThrottle`, scope `login`). "Remember me" is a real,
  functional choice, not decorative — it determines whether the access
  token is stored in `localStorage` (persists across browser restarts)
  or `sessionStorage` (cleared when the tab closes).
- **Google Sign-In** (`components/common/GoogleLoginButton.jsx`) — a real
  `@react-oauth/google` integration, `POST /user/google-auth/`, which
  verifies the Google ID token server-side. Falls back to a "Setup
  Required" placeholder if `VITE_GOOGLE_CLIENT_ID` isn't configured,
  rather than silently failing.
- **Onboarding** (`pages/OnboardingPage.jsx`, `POST /user/complete-onboarding/`)
  — the completion step after a first-time Google sign-in that's missing
  required fields (phone, location, or business name for an owner).
  Explicitly cannot be used to change role after the fact.
- **Forgot / reset password** — `POST /user/password-reset/` (always
  returns success regardless of whether the email exists, to prevent
  account enumeration) emails a reset link
  (`{FRONTEND_URL}/reset-password/{token}`, 45-minute TTL) via
  `pages/ForgotPassword.jsx`; `pages/ResetPassword.jsx` completes it via
  `POST /user/password-reset/confirm/`, which also logs out every other
  active session for that user (all outstanding refresh tokens are
  blacklisted).
- **Booking-invite-first redirect**: if a not-yet-logged-in user landed
  on an invite link before signing up or logging in, both Signup and
  Login remember the pending invite token (`localStorage`) and redirect
  to the invite claim page immediately after auth, ahead of the normal
  role-based dashboard redirect.

## Browsing and filtering boxes

- **Home** (`pages/Home.jsx`) — hero search (sport/city/date, purely
  client-side, navigates into `/boxes` with the choice pre-applied),
  sport category tiles, a "Popular near you" rail
  (`GET /boxes/public/popular/`), and the chatbot widget.
- **Browse Boxes** (`pages/BoxListings.jsx`, `/boxes`) — fetches the
  full public box catalog once (`GET /boxes/public/`) and does all
  filtering, sorting, and search **client-side** — a deliberate choice
  (documented in the frontend code) to keep the filter UI and grid
  animations instant rather than round-tripping to the server on every
  filter change. Filters: location, sport, price range, minimum rating,
  amenities (`components/boxes/FilterPanel.jsx`), and a debounced
  free-text search. Grid/list layout toggle; a "Map" button opens a
  Leaflet map view of the currently-filtered results
  (`components/maps/BoxListingsMap.jsx`).
- **Nearby search** — a separate map (`components/maps/NearbyBoxesMap.jsx`,
  opened from the header) uses real browser geolocation and calls
  `GET /boxes/public/nearby/?lat=&lng=&radius=` (Haversine distance,
  server-side, not client-computed, and deliberately not cached — see
  `docs/SCALABILITY_QA_GUIDE.md`).
- **Favoriting** — the heart icon on any `BoxCard`
  (`components/boxes/BoxCard.jsx`) is wired to
  `POST`/`DELETE /dashboard/favorites/`, optimistically updated, and
  reflected on the Favorites tab of the user dashboard (see below).

## Box details and the live slot reservation system

`pages/BoxDetails.jsx` is the most feature-dense player-facing page.

- Image gallery with lightbox, amenities, house rules, reviews with a
  rating histogram (see [Reviews](#reviews-with-photos)), and JSON-LD
  structured data for SEO.
- **Slot picker**: a date strip plus an hour-by-hour grid generated from
  the box's `opening_time`/`closing_time` (default `06:00`–`23:00` if
  unset). Already-booked slots are fetched via
  `GET /bookings/booked_slots/?box_id=&date=` and re-polled every 30
  seconds. A day with a `BlockedDate` on it (owner holiday/maintenance
  closure) is disabled entirely. Duration is selectable 1–6 hours; a
  duration that would run past closing time is excluded from the grid.
- **Price preview**: once a slot and duration are chosen,
  `POST /bookings/price-preview/` resolves the real price — a box owner
  can define `PricingRule`s (flat peak/off-peak overrides for
  weekday/weekend/all, matched by exact start time) that can differ from
  the box's base hourly price. The frontend falls back to a flat-rate
  estimate only if this call hasn't returned yet.
- **The hold/queue mechanism ("Book Now")**:
  1. `POST /bookings/reserve/` either grants an immediate hold
     (`status: 'held'`, with an expiry timestamp) or, if someone else
     already holds that exact slot, a FIFO queue position
     (`status: 'queued'`).
  2. The player is taken to Checkout with this reservation state.
  3. A live WebSocket (`ws/bookings/slot/{box_id}/{date}/{start_time}/{duration}/`,
     driven by `hooks/useSlotReservation.js`) pushes real-time updates:
     the countdown ticking down, being promoted to `held` when the
     person ahead gives up or times out, or being told the slot was just
     booked by someone else (`status: 'lost'`) or claimed directly by the
     venue owner (`owner_reserved`).
  
  See [`docs/ATOMICITY_DOCUMENTATION.md`](ATOMICITY_DOCUMENTATION.md) for
  the full server-side mechanics of this system — it's a real
  Redis-backed engine, not a simulated countdown.

## Checkout — and the payment reality

`pages/Checkout.jsx` re-opens the same live hold/queue WebSocket (seeded
from the reservation made on the Box Details page) so the countdown and
queue position stay accurate across the page navigation, and shows a
banner reflecting current status (held with countdown, or queued at
position N).

**The payment-method selector (UPI / Card / Wallet icons) is
presentational only — there is no payment gateway anywhere in this
app.** The page says so explicitly in its own UI copy ("Demo only —
payment methods are for display; bookings are confirmed here and settled
at the venue"), and `handleConfirm()` never reads which icon is selected
— no value is ever sent to the backend based on it. This is consistent
with the rest of the app: `CancellationPolicy.jsx` and `Contact.jsx`'s
FAQ both state plainly that payment happens at the venue and no online
payment is required to confirm a booking.

What "Confirm booking" actually does: calls
`POST /bookings/confirm/{hold_token}/`, which the backend re-validates
and re-computes entirely server-side (coupon/redeem-code discount,
wallet deduction) rather than trusting anything the client already
displayed — this writes the real `Booking` row. A "your details"
name/phone/email block on the page is pre-filled from the logged-in
user's profile but isn't submitted anywhere as part of confirming — it's
informational, not an editable checkout field that changes the booking.

- **Coupon / redeem code**: an "Apply" button calls
  `POST /bookings/coupons/validate/` as a dry-run (doesn't consume the
  code yet), which tries a platform-wide `Coupon` first and falls back to
  a box-scoped owner `RedeemCode`; the resolved code rides along on the
  real `confirm` call and is only actually consumed there.
- **Wallet**: the real wallet balance is fetched
  (`GET /rewards/wallet/`); a "use wallet balance" checkbox deducts
  `min(balance, total due)` from what's shown as due — the actual
  deduction is recomputed and enforced server-side at confirm time, never
  trusted from the client.
- **Leaving checkout**: `POST /bookings/release_hold/{hold_token}/`
  explicitly gives up the hold immediately (promoting the next queued
  user right away) rather than making them wait out the TTL.

## Booking confirmation, calendar export, and inviting others

`pages/BookingConfirmation.jsx` (`/booking/:id`) is dual-purpose: the
celebratory "just booked!" screen right after Checkout, and a permanent,
always-reachable booking-details page (via the Bookings tab of the user
dashboard) fetched with `GET /bookings/{id}/` — scoped server-side to the
booker, an accepted invitee, or the box's owner, so nobody else can view
it.

- **Add to Calendar** — fully functional. Generates a real RFC-5545
  `.ics` file client-side (hand-built, no library) and downloads it via a
  Blob URL. No backend call involved.
- **Share** — uses the native `navigator.share()` where available, or
  copies the link to the clipboard.
- **Invite Squad** — opens `components/bookings/InviteBookingModal.jsx`,
  shown only to the original booker. Invite by searching an existing user
  (`GET /user/search/`) or by raw email (works even if that person hasn't
  signed up yet — the invite is claimed automatically when they
  register). `POST /bookings/{id}/invite/` creates the invite, emails a
  claim link, and notifies the invitee in-app if they already have an
  account.
  - `pages/InviteClaim.jsx` (`/invites/:token`, public) is the landing
    page an invited user lands on — `GET /bookings/invites/{token}/`
    shows who invited them to what; if not logged in, the token is
    remembered and resumed after login/signup; Accept/Decline call
    `POST /bookings/invites/{token}/accept|decline/`. Acceptance is
    token-authorized, not email-matched — whoever is logged in when they
    click Accept claims it (the same model as a Google Docs share link).
  - Invited users see the booking (read-only) once accepted, and the
    booker/box owner see a "who's coming" list with each invite's status.
- **Reschedule and Cancel** — see their own sections below; both are
  available from this page for the booker (and for the box owner, viewing
  their own venue's booking).
- The "booking pass" graphic on this page is a deterministic pattern
  seeded from the booking ID — explicitly decorative, not a real
  scannable code.

## Recurring (weekly) bookings

From Box Details, checking "Repeat this booking weekly" and choosing a
week count (2, 4, 8, or 12) sends `POST /bookings/recurring/`, which
books every week's occurrence in one request, entirely bypassing the
hold/queue system (these are proactive future bookings, not
hot-contested slots). Partial success is the normal, expected outcome —
the response reports which weeks succeeded and which didn't (e.g. a
later week collides with something else), shown to the player as a
per-week breakdown rather than a single pass/fail.

## Coupons and redeem codes

Two independent code systems apply at checkout, mutually exclusive per
booking:

- **Platform coupons** — admin-managed, code-based, percent or flat
  discount, with optional validity window and usage cap. Not tied to a
  specific box.
- **Redeem codes** — two flavors sharing one model
  (`rewards.models.RedeemCode`): admin-issued codes (`box=None`) are
  redeemable straight into wallet balance via the Rewards tab (see
  below); owner-issued codes (`box` set) are box-scoped checkout
  discounts only, and are explicitly rejected if someone tries to redeem
  them into their wallet instead — the redeem-into-wallet endpoint tells
  them to use it at that box's checkout instead.

Both are validated the same way at checkout — dry-run preview via
`POST /bookings/coupons/validate/`, real consumption only on the actual
booking write.

## Waitlist

If a slot is already booked, `SlotGrid` on Box Details shows a
"Notify me" toggle instead of (or alongside) the reservation controls.
`POST /bookings/waitlist/` joins (idempotent — rejoining an already-
joined slot is a no-op, not an error); `GET /bookings/waitlist/mine/`
powers the "On waitlist ✓" state across the app; `DELETE /bookings/waitlist/{id}/`
leaves. This is a separate, longer-lived mechanism from the Redis
hold/queue — it's a "tell me if this slot frees up," not a live queue
position. Fulfillment is passive: if that exact slot's booking is later
cancelled, every matching waitlist entry is notified once and then
cleared (there's no re-notify, and a slot freeing up via an abandoned
Redis hold rather than a real cancellation does not trigger a waitlist
notification).

## Cancellation and wallet refund

From the user dashboard's Bookings tab or the booking details page,
Cancel opens a confirmation with an optional reason, then calls
`POST /bookings/{id}/cancel/`. Server-side rules: can't cancel an
already-cancelled booking, and can't cancel within 2 hours of the
booking's start time. If any wallet balance was used to pay for the
booking, that exact amount is credited straight back to the wallet
(there is no other form of payment to refund, since there's no payment
gateway — see [Checkout](#checkout--and-the-payment-reality)); the box
owner is notified. **Note**: neither the dashboard nor the booking
details page shows a live "you'll get ₹X back" preview before
confirming — the refund mechanics are documented on the static
Cancellation Policy page, not surfaced contextually at the moment of
cancelling.

## Reschedule

Available from the booking details page — an inline date/slot picker
reusing the same availability logic as Box Details, for the same box and
duration (only the date/time can change). `POST /bookings/{id}/reschedule/`
enforces: only once ever per booking (a second reschedule attempt is
rejected), the same 2-hour cutoff as cancellation (checked against the
booking's *current* time), and the new date can't be in the past. The
original date/time is preserved for reference even after rescheduling.

## Reviews, with photos

"Add review" (available once a player has a Confirmed or Completed
booking on that box — enforced server-side, not just hidden client-side)
opens `components/common/AddReviewForm.jsx`: a 1–5 star rating, a
comment, and up to 4 photos, submitted as multipart to
`POST /boxes/public/{boxId}/add_review/`. One review per user per box
(enforced by a database constraint, not just the UI). The box's overall
rating is recomputed as a live average on every review add/delete
(including admin moderation deletes). Owners can post one public response
per review. The rating **histogram** shown on Box Details is computed
client-side from the full list of reviews the box's detail payload
already includes — there's no dedicated server-side histogram/aggregation
endpoint.

## Notifications

`components/common/NotificationBell.jsx` — real, but polling-based, not
push: unread count is refetched every 30 seconds
(`GET /user/notifications/unread-count/`) while logged in; the full list
loads only when the bell is opened (`GET /user/notifications/`). Clicking
a notification marks it read (`POST /user/notifications/{id}/read/`) and
navigates to its linked page if it has one; "mark all read" is also
available. Notifications are system-generated from real events throughout
the app (booking confirmed/cancelled/rescheduled, invite received,
waitlist slot freed up, wallet credited, review response posted, etc.) —
there is no way for a player to configure notification preferences, and
no admin tool to compose/broadcast a notification (see
`docs/ADMIN_FEATURES.md`).

## Wallet and rewards

`components/rewards/UserRewardsTab.jsx` (a tab on the user dashboard) —
every part of this is backed by real endpoints, not simulated:

- **Wallet** — balance, lifetime earned, lifetime spent
  (`GET /rewards/wallet/`), and a full transaction history
  (`GET /rewards/wallet/transactions/`), typed as cashback, scratch card,
  spin wheel, redeem code, booking payment, admin adjustment, or refund.
- **Cashback** — automatically credited when a booking is marked
  `Completed` (see `docs/OWNER_FEATURES.md`/`docs/ADMIN_FEATURES.md` for
  how completion and the cashback rule are administered); each booking
  can only trigger cashback once.
- **Scratch cards** — granted automatically on booking completion
  (subject to a platform-wide and a per-owner opt-out toggle, both
  admin/owner-controlled) or manually gifted by an owner or admin.
  Tap-to-reveal on the Rewards tab calls
  `POST /rewards/scratch-cards/{id}/scratch/`, crediting a prize amount
  that was already fixed at grant time (never trusted from the client).
  Each card expires 30 days after being granted.
- **Spin wheel** — one free spin is granted per completed booking
  (unconditionally, no opt-out toggle unlike scratch cards).
  `GET /rewards/spin/` shows how many spins are available and the active
  prize segments; `POST /rewards/spin/` consumes the oldest unused spin
  and returns a weighted-random prize, which the wheel animates to land
  on.
- **Redeem codes** — a text field on the Rewards tab
  (`POST /rewards/redeem/`) for admin-issued, wallet-credit codes only
  (see [Coupons and redeem codes](#coupons-and-redeem-codes) above for
  the owner-issued, box-scoped variety, which is redeemed at checkout
  instead).
- **Referrals** — no referral system exists anywhere in the codebase.
  There is no referral code, no "invite a friend" reward, and no related
  model — don't confuse this with the Invite Squad feature above, which
  is about sharing an existing booking, not earning a reward for
  referring someone.

## Gamification (achievements, levels)

A separate, purely cosmetic layer on top of real booking activity — no
money moves here. The Achievements tab (`GET /dashboard/achievements/`,
`GET /dashboard/user-stats/`) shows a level (Beginner through Champion,
based on accumulated points), a points/progress bar, and badges earned
for milestones like booking counts, spend totals, and weekly/monthly
activity streaks. Recomputed as a side effect of viewing the tab, not on
a schedule.

## Profile management

`pages/Profile.jsx` has two independent forms:

1. **Profile edit** — name, phone, location, date of birth, bio,
   preferred sports, emergency contact, address
   (`PATCH /user_profile/my-profile/update/`); email is always read-only.
   **Avatar upload** is real and wired (a separate multipart request
   through the same endpoint).
2. **Change password** (`POST /user/change-password/`) — on success, the
   backend blacklists every outstanding refresh token for that user
   (including the current session's), so the frontend deliberately logs
   the user out and redirects to Login rather than trying to keep the
   session alive.

## Chatbot

A floating widget (`components/common/Chatbot.jsx`) present on Home,
Browse Boxes, and Box Details, backed by a real Gemini-powered endpoint
(`POST /api/chatbot/`) — not a scripted set of canned responses. See
[`CHATBOT_SETUP.md`](CHATBOT_SETUP.md) for the technical details
(model, rate limits, error-handling behavior).

## Static/legal pages

`About.jsx` (its platform stats are live —
`GET /boxes/public/stats/` — everything else on the page is static
copy), `Contact.jsx` (the contact form is real:
`POST /contact/`, emailed to support via Resend — see
`docs/ADMIN_FEATURES.md` for how it's handled on the receiving end),
`CancellationPolicy.jsx`, `PrivacyPolicy.jsx`, `Terms.jsx`, `NotFound.jsx`
are static/informational pages with no further backend logic beyond
what's noted.
