import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { StatusPill } from "@/components/StatusPill";
import { VenueCard } from "@/components/VenueCard";
import { formatHour, venues } from "@/data/mock";
import { inr, useStore } from "@/lib/store";
import { prettyDate, todayISO } from "@/lib/dates";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My Bookings & Favourites | BookmyBox" },
      {
        name: "description",
        content: "Track upcoming slots, review past games, manage favourite venues and payment methods.",
      },
      { property: "og:title", content: "My Bookings | BookmyBox" },
      { property: "og:description", content: "Upcoming slots, history and favourite grounds in one place." },
    ],
  }),
  component: Dashboard,
});

type Tab = "upcoming" | "history" | "favourites" | "profile";

function Dashboard() {
  const { bookings, cancelBooking, favourites, profile, hydrated } = useStore();
  const [tab, setTab] = useState<Tab>("upcoming");

  const today = todayISO();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.dateISO >= today);
  const history = bookings.filter((b) => b.status !== "confirmed" || b.dateISO < today);
  const favVenues = venues.filter((v) => favourites.includes(v.id));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "history", label: "History", count: history.length },
    { id: "favourites", label: "Favourites", count: favVenues.length },
    { id: "profile", label: "Profile" },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl uppercase sm:text-4xl">Hey {profile.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your games, grounds and payment details.</p>

        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm transition",
                tab === t.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && ` (${t.count})`}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {!hydrated && <p className="text-sm text-muted-foreground">Loading your bookings…</p>}

          {hydrated && tab === "upcoming" && (
            upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming games"
                body="Book a slot and it'll show up here with your QR pass."
              />
            ) : (
              upcoming.map((b) => (
                <article key={b.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg uppercase">{b.venueName}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {prettyDate(b.dateISO)} ·{" "}
                        {[...b.hours].sort((x, y) => x - y).map((h) => formatHour(h)).join(", ")}
                      </p>
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-display text-xl">{inr(b.total)}</span>
                    <div className="flex gap-2">
                      <Link
                        to="/booking/$bookingId"
                        params={{ bookingId: b.id }}
                        className="rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wide"
                      >
                        View pass
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          cancelBooking(b.id);
                          toast.success("Booking cancelled — refund in 3–5 days");
                        }}
                        className="rounded-full border border-destructive/50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-destructive"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Free cancellation up to 6 hours before start. Reschedule once at no cost.
                  </p>
                </article>
              ))
            )
          )}

          {hydrated && tab === "history" && (
            history.length === 0 ? (
              <EmptyState title="No past games yet" body="Your completed games will be listed here." />
            ) : (
              history.map((b) => (
                <article
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
                >
                  <div>
                    <h2 className="font-display text-base uppercase">{b.venueName}</h2>
                    <p className="text-sm text-muted-foreground">{prettyDate(b.dateISO)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{inr(b.total)}</span>
                    <StatusPill status={b.status === "confirmed" ? "completed" : b.status} />
                  </div>
                </article>
              ))
            )
          )}

          {hydrated && tab === "favourites" && (
            favVenues.length === 0 ? (
              <EmptyState title="No favourites yet" body="Tap the heart on any venue to save it here." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {favVenues.map((v) => (
                  <VenueCard key={v.id} venue={v} />
                ))}
              </div>
            )
          )}

          {hydrated && tab === "profile" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                  Profile
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Name" value={profile.name} />
                  <Row label="Phone" value={profile.phone} />
                  <Row label="Email" value={profile.email} />
                  <Row label="City" value={profile.city} />
                </dl>
              </section>
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                  Payment methods
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>UPI · arjun@upi</span>
                    <span className="text-primary">Default</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Visa ···· 4218</span>
                    <span>Exp 09/29</span>
                  </li>
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Link
        to="/venues"
        className="mt-5 inline-block rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
      >
        Find a ground
      </Link>
    </div>
  );
}
