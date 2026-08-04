# Court Connect

Prompt for Lovable

Build a modern, sporty web app called [YOUR BRAND NAME] — a platform for booking sports grounds/turfs by the hour (football turf, box cricket, basketball court, pickleball court, badminton court, etc.). Think "Airbnb meets a sports app" — fast, visual, and built around live availability and quick booking.

Brand & Visual Direction

Vibe: high-energy, modern, athletic — not corporate. Think Nike/Decathlon meets a booking SaaS.

Color palette: dark charcoal/near-black base (#0D0D0D–#111827) with one electric accent color (lime green #C8FF00, or orange #FF5C00, or cyan — pick one and use it consistently for CTAs, active states, and highlights). Use turf-green as a secondary accent for sports-specific cards.

Typography: bold, condensed/geometric sans-serif for headings (like Clash Display, Cabinet Grotesk, or Inter Tight); clean readable sans for body text.

Imagery: large hero photography/video of turfs and players in action, dark overlay gradients so text stays legible.

Iconography: custom sport icons (football, basketball, pickleball paddle, cricket, badminton) used throughout as filter chips/badges.

Overall feel: confident, fast, a little bit "stadium at night under floodlights."

Animation & Micro-interaction Requirements

Smooth scroll-triggered fade/slide-ins for sections on the landing page.

Hero section: subtle parallax or looping background video/motion graphic, animated headline (staggered word/letter reveal).

Sport category chips: animated underline/scale on hover and selection.

Ground cards: hover lift + image zoom + shadow glow in accent color.

Time-slot grid: slots animate in as they load; selected slot pulses/highlights with accent color; unavailable slots are visibly greyed out with a subtle strike animation.

Sticky booking summary bar that slides up from the bottom on mobile as slots are selected.

Page transitions: smooth fade/slide between routes, no jarring jumps.

Button interactions: magnetic/spring hover effect on primary CTAs.

Loading states: skeleton loaders styled to match the dark theme (not generic grey boxes — subtle shimmer in brand tones).

Success states (booking confirmed): a satisfying full-screen confirmation animation (checkmark draw-in, confetti or light burst in accent color).

Core Pages & Flows

1. Landing / Home Page

Sticky nav with logo, sport categories, "Venues," "How it works," Login/Signup, and a prominent "Book Now" CTA.

Hero with headline, subtext, and a quick-search bar (sport type + location/city + date).

Sport category grid (Football Turf, Basketball, Pickleball, Cricket Box, Badminton, etc.) — each animated card links to filtered listings.

"Popular Venues Near You" carousel with ground cards (image, name, sport tags, price/hour, rating, distance).

"How It Works" 3-step section (Choose ground → Pick slot → Pay & play) with icon animations.

Testimonials/social proof carousel.

App download / offers banner.

Footer with city links, contact, socials.

2. Venue Listing Page

Filter sidebar (sport type, price range, distance, rating, amenities like parking/washroom/floodlights, indoor/outdoor).

Sort options (nearest, price, rating).

Map view toggle showing venue pins.

Grid/list of venue cards with quick "Check Availability" button.

Smooth filter animations (cards re-flow, not just reload).

3. Venue Detail Page

Image/video gallery (swipeable, full-screen lightbox).

Venue name, sport type badges, rating & reviews, address with embedded map.

Amenities list with icons.

Pricing table (per hour, peak/off-peak if applicable).

Interactive slot booking widget:

Date picker (horizontal scrollable date strip, today highlighted).

Time-slot grid for that day, color-coded: available / selected / booked.

Multi-slot selection support (book 2 consecutive hours).

Real-time price calculation as slots are selected.

Reviews & ratings section with photos.

Sticky "Continue to Book" bar showing selected slots + total price.

4. Booking & Checkout Flow

Booking summary (venue, sport, date, time, duration, price breakdown incl. taxes/convenience fee).

User details (auto-filled if logged in).

Payment integration UI (cards/UPI/wallet options — mock is fine for now).

Coupon/offer code field with animated success/error feedback.

Confirmation screen with booking ID, QR code/pass for entry, "Add to Calendar" button, and share option.

5. User Dashboard

Upcoming bookings (with countdown/status: confirmed, ongoing, completed, cancelled).

Booking history.

Favorite venues.

Profile & payment methods.

Cancel/reschedule flow with clear policy messaging.

6. Venue Owner / Admin Dashboard (if in scope)

Add/edit venue listings (photos, pricing, amenities, sport types).

Manage slot availability calendar (block/unblock slots).

View bookings & earnings analytics (simple charts).

Reviews management.

7. Auth

Clean login/signup with email, phone OTP, and social login options.

Onboarding: ask user's preferred sport(s) and city for a personalized home feed.

Functional Requirements

Real-time-feeling slot availability (visually, even if backend is mocked/stubbed for now).

Multi-sport filtering and search.

Responsive, mobile-first design (most users will book on mobile) — the whole flow should feel like a native app.

Fast perceived performance: optimistic UI updates when selecting slots.

Empty states, error states, and loading states all styled on-brand (not default browser styles).

Accessible color contrast despite the dark theme.

Tech/Structure Notes for Lovable

Component-based structure: reusable VenueCard, SlotGrid, SportBadge, BookingSummaryBar, DatePicker components.

Use mock/sample data for venues, sports, slots, and bookings to fully demonstrate the flow end-to-end.

Prioritize building: Home → Venue Listing → Venue Detail with slot booking → Checkout → Confirmation → User Dashboard, in that order.

Design this to feel premium and fast — like a product a sports startup would actually launch, not a generic booking template.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/69c433df-455e-41dd-a269-d15f8332dc7b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
