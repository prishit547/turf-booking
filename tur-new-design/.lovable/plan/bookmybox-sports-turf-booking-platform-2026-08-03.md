# BookmyBox — sports turf booking platform

A dark, high-energy booking app for hourly sports grounds (football turf, box cricket, basketball, pickleball, badminton). Built entirely on mock data so the full flow works end to end.

## Design direction

- Base: near-black charcoal (#0D0D0D / #111827) surfaces, layered cards
- Accent: electric lime #C8FF00 for CTAs, active states, highlights
- Secondary: turf green for sport-specific cards and badges
- Headings: bold geometric/condensed sans; body: clean readable sans (loaded via font link in the root route)
- All colors as semantic tokens in `src/styles.css` — no hardcoded color classes

## Motion

- Scroll-triggered fade/slide-ins per landing section
- Hero: parallax background image with dark gradient overlay, staggered word-by-word headline reveal
- Sport chips: animated underline + scale on hover/select
- Venue cards: hover lift, image zoom, lime glow shadow
- Slot grid: staggered slot entrance, pulsing selected slot, greyed booked slots with strike
- Sticky booking bar slides up from bottom as slots are selected
- Route transitions: fade/slide
- Spring hover on primary buttons
- Branded shimmer skeletons (dark tones, not grey boxes)
- Booking success: full-screen checkmark draw-in + lime light burst/confetti

## Pages

1. **Home** (`/`) — sticky nav, hero with quick-search (sport + city + date), sport category grid, popular venues carousel, How It Works (3 steps), testimonials carousel, offers banner, footer.
2. **Venues** (`/venues`) — filter sidebar (sport, price, distance, rating, amenities, indoor/outdoor), sort options, grid/list toggle, static map-view panel with venue pins, animated card re-flow on filter change.
3. **Venue detail** (`/venues/$venueId`) — gallery with lightbox, badges, rating, address + map panel, amenities, peak/off-peak pricing table, horizontal date strip, time-slot grid with multi-slot consecutive selection, live price calc, reviews, sticky "Continue to Book" bar.
4. **Checkout** (`/checkout`) — booking summary with price breakdown (taxes, convenience fee), user details form, mock payment options (card/UPI/wallet), coupon field with animated success/error.
5. **Confirmation** (`/booking/$bookingId`) — success animation, booking ID, QR pass, add-to-calendar, share.
6. **Dashboard** (`/dashboard`) — upcoming bookings with status/countdown, history, favorites, profile & payment methods, cancel/reschedule flow with policy copy.
7. **Auth** (`/auth`) — login/signup UI with email, phone OTP, social buttons; onboarding step for preferred sports + city (mock, stored in client state).
8. **Owner admin** (`/owner`) — venue list with add/edit form, availability calendar to block/unblock slots, bookings + earnings charts, reviews management.

## Reusable components

`VenueCard`, `SportBadge`, `SportChipRow`, `SlotGrid`, `DateStrip`, `BookingSummaryBar`, `PriceBreakdown`, `FilterPanel`, `RatingStars`, `Skeleton` variants, `SectionReveal`, `StatusPill`.

## Technical notes

- TanStack Start routes under `src/routes`; each page gets its own `head()` with unique title/description/OG tags
- Mock data modules in `src/data/` (venues, sports, slots, bookings, reviews, testimonials) with helper selectors; slot availability generated deterministically per venue/date so it feels live
- Booking draft + auth/onboarding/favorites held in React context with localStorage persistence (read after hydration to avoid SSR mismatch)
- Motion for React for animations; Recharts for owner analytics; generated hero and venue imagery
- Mobile-first layouts throughout; accessible contrast checked on the dark theme; on-brand empty/error/loading states everywhere

## Build order

Home → Venues → Venue detail + slots → Checkout → Confirmation → Dashboard → Auth → Owner admin.
