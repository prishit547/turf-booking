import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { CalendarPlus, Share2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { formatHour } from "@/data/mock";
import { inr, useStore } from "@/lib/store";
import { prettyDate } from "@/lib/dates";
import { toast } from "sonner";

export const Route = createFileRoute("/booking/$bookingId")({
  head: () => ({
    meta: [
      { title: "Booking Confirmed | BookmyBox" },
      { name: "description", content: "Your slot is locked in. Show the QR pass at the venue gate." },
      { property: "og:title", content: "Booking Confirmed | BookmyBox" },
      { property: "og:description", content: "Your turf booking is confirmed with a QR entry pass." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { bookingId } = Route.useParams();
  const { bookings, hydrated } = useStore();
  const booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="font-display text-2xl uppercase">
            {hydrated ? "Booking not found" : "Loading your pass…"}
          </h1>
          {hydrated && (
            <Link
              to="/dashboard"
              className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
            >
              See my bookings
            </Link>
          )}
        </div>
      </div>
    );
  }

  const hours = [...booking.hours].sort((a, b) => a - b);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="relative mx-auto max-w-lg px-4 py-14 text-center">
        <div className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
          className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border-2 border-primary"
        >
          <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
            <motion.path
              d="M12 25 21 33 36 16"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            />
          </svg>
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-primary"
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: Math.cos((i / 12) * Math.PI * 2) * 80,
                y: Math.sin((i / 12) * Math.PI * 2) * 80,
              }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          ))}
        </motion.div>

        <h1 className="relative mt-6 font-display text-3xl uppercase">You're on</h1>
        <p className="relative mt-2 text-sm text-muted-foreground">
          Booking ID <span className="font-semibold text-primary">{booking.id}</span>
        </p>

        <div className="relative mt-8 rounded-2xl border border-border bg-card p-6 text-left">
          <h2 className="font-display text-xl uppercase">{booking.venueName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{prettyDate(booking.dateISO)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hours.map((h) => formatHour(h)).join(", ")} · {hours.length} hr
          </p>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Paid</span>
            <span className="font-display text-2xl">{inr(booking.total)}</span>
          </div>

          <div className="mt-6 grid place-items-center rounded-xl bg-elevated p-5">
            <QrPass seed={booking.id} />
            <p className="mt-3 text-xs text-muted-foreground">Show this pass at the gate</p>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => toast.success("Added to your calendar")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide"
            >
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </button>
            <button
              type="button"
              onClick={() => toast.success("Invite link copied")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide"
            >
              <Share2 className="h-4 w-4" /> Share with squad
            </button>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/dashboard"
            className="rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
          >
            My bookings
          </Link>
          <Link
            to="/venues"
            className="rounded-full border border-border px-5 py-2.5 text-xs font-bold uppercase tracking-wide"
          >
            Book another
          </Link>
        </div>
      </div>
    </div>
  );
}

function QrPass({ seed }: { seed: string }) {
  const cells = Array.from({ length: 144 }, (_, i) => {
    let h = i + 7;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return h % 3 !== 0;
  });
  return (
    <div className="grid grid-cols-12 gap-0.5 rounded-lg bg-foreground p-3" aria-label="Entry QR code">
      {cells.map((on, i) => (
        <span
          key={i}
          className={on ? "h-2.5 w-2.5 bg-background" : "h-2.5 w-2.5 bg-foreground"}
          aria-hidden
        />
      ))}
    </div>
  );
}
