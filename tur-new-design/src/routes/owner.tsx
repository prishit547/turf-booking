import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DateStrip } from "@/components/DateStrip";
import { RatingStars } from "@/components/RatingStars";
import { SportBadge } from "@/components/SportBadge";
import { earningsByDay, getSlots, reviews, sportSplit, venues } from "@/data/mock";
import { inr, useStore } from "@/lib/store";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "Venue Owner Dashboard — Manage Slots & Earnings | BookmyBox" },
      {
        name: "description",
        content:
          "List your ground, block or open hourly slots, track bookings and earnings, and reply to reviews.",
      },
      { property: "og:title", content: "Venue Owner Dashboard | BookmyBox" },
      {
        property: "og:description",
        content: "Manage availability, pricing and earnings for your turf or court.",
      },
    ],
  }),
  component: Owner,
});

type Tab = "venues" | "calendar" | "analytics" | "reviews";

function Owner() {
  const { blockedSlots, toggleBlockedSlot } = useStore();
  const [tab, setTab] = useState<Tab>("analytics");
  const [venueId, setVenueId] = useState(venues[0]!.id);
  const [dateISO, setDateISO] = useState(todayISO());

  const key = `${venueId}|${dateISO}`;
  const blocked = blockedSlots[key] ?? [];
  const slots = getSlots(venueId, dateISO);
  const weekTotal = earningsByDay.reduce((s, d) => s + d.earnings, 0);
  const weekBookings = earningsByDay.reduce((s, d) => s + d.bookings, 0);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-3xl uppercase sm:text-4xl">Owner console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Availability, pricing and performance for your grounds.
        </p>

        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
          {(["analytics", "calendar", "venues", "reviews"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm capitalize transition",
                tab === t
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "analytics" && (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Earnings this week" value={inr(weekTotal)} />
              <Stat label="Bookings" value={String(weekBookings)} />
              <Stat label="Slot fill rate" value="74%" />
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Earnings by day
              </h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={earningsByDay}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="earnings" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Bookings trend
              </h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={earningsByDay}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bookings"
                      stroke="var(--chart-2)"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Sport mix
              </h2>
              <ul className="mt-4 space-y-3">
                {sportSplit.map((s) => (
                  <li key={s.sport}>
                    <div className="flex justify-between text-sm">
                      <span>{s.sport}</span>
                      <span className="text-muted-foreground">{s.value}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-elevated">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${s.value}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "calendar" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                aria-label="Venue"
                className="rounded-full border border-border bg-card px-4 py-2 text-sm"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <DateStrip value={dateISO} onChange={setDateISO} />
            <p className="text-sm text-muted-foreground">
              Tap a slot to block or unblock it for players.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((s) => {
                const isBlocked = blocked.includes(s.hour);
                const isBooked = s.status === "booked";
                return (
                  <button
                    key={s.hour}
                    type="button"
                    disabled={isBooked}
                    onClick={() => {
                      toggleBlockedSlot(key, s.hour);
                      toast.success(isBlocked ? `${s.label} opened` : `${s.label} blocked`);
                    }}
                    className={cn(
                      "rounded-xl border px-2 py-3 text-center text-sm transition",
                      isBooked && "cursor-not-allowed border-border bg-muted/40 text-muted-foreground",
                      !isBooked && isBlocked && "border-destructive/60 bg-destructive/15 text-destructive",
                      !isBooked && !isBlocked && "border-border bg-card hover:border-primary/60",
                    )}
                  >
                    <span className="block font-semibold">{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {isBooked ? "Booked" : isBlocked ? "Blocked" : inr(s.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "venues" && (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-3">
              {venues.slice(0, 3).map((v) => (
                <article
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
                >
                  <div>
                    <h2 className="font-display text-lg uppercase">{v.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {v.area}, {v.city} · {inr(v.pricePerHour)}–{inr(v.peakPricePerHour)}/hr
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {v.sports.map((s) => (
                        <SportBadge key={s} sport={s} tone="turf" />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.success(`${v.name} opened for editing`)}
                    className="rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wide"
                  >
                    Edit
                  </button>
                </article>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                toast.success("Venue submitted for review");
              }}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Add a venue
              </h2>
              <div className="mt-4 space-y-3 text-sm">
                <input
                  required
                  placeholder="Venue name"
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 outline-none focus:border-primary"
                />
                <input
                  required
                  placeholder="Area, city"
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 outline-none focus:border-primary"
                />
                <input
                  type="number"
                  required
                  placeholder="Price per hour"
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 outline-none focus:border-primary"
                />
                <textarea
                  rows={3}
                  placeholder="Amenities and notes"
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="w-full rounded-full bg-primary py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
                >
                  Submit listing
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === "reviews" && (
          <div className="mt-6 space-y-3">
            {reviews.slice(0, 6).map((r) => (
              <article key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-sm uppercase">{r.author}</p>
                  <RatingStars rating={r.rating} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
                <button
                  type="button"
                  onClick={() => toast.success("Reply sent to player")}
                  className="mt-3 rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wide"
                >
                  Reply
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl">{value}</p>
    </div>
  );
}
