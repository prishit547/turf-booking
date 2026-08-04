import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { CreditCard, Smartphone, Wallet } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { MagneticButton } from "@/components/MagneticButton";
import { coupons, formatHour } from "@/data/mock";
import { inr, priceBreakdown, useStore, type Booking } from "@/lib/store";
import { prettyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Confirm Your Slot | BookmyBox" },
      {
        name: "description",
        content: "Review your slots, apply an offer code and pay to confirm your booking instantly.",
      },
      { property: "og:title", content: "Checkout | BookmyBox" },
      { property: "og:description", content: "Confirm and pay for your turf or court booking." },
    ],
  }),
  component: Checkout,
});

const methods = [
  { id: "upi", label: "UPI", icon: Smartphone, hint: "GPay, PhonePe, Paytm" },
  { id: "card", label: "Card", icon: CreditCard, hint: "Visa, Mastercard, Rupay" },
  { id: "wallet", label: "Wallet", icon: Wallet, hint: "BookmyBox credits" },
] as const;

function Checkout() {
  const navigate = useNavigate();
  const { draft, profile, addBooking, hydrated } = useStore();
  const [method, setMethod] = useState<(typeof methods)[number]["id"]>("upi");
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ pct: number; label: string } | null>(null);
  const [codeError, setCodeError] = useState("");
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({ name: profile.name, phone: profile.phone, email: profile.email });

  if (!draft) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="font-display text-2xl uppercase">Nothing to check out</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hydrated ? "Pick some slots first and they'll show up here." : "Loading your selection…"}
          </p>
          <Link
            to="/venues"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
          >
            Browse venues
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = draft.hours.reduce((sum, h) => sum + (draft.pricePerSlot[h] ?? 0), 0);
  const bill = priceBreakdown(subtotal, applied?.pct ?? 0);

  function applyCode() {
    const found = coupons[code.trim().toUpperCase()];
    if (found) {
      setApplied({ pct: found.discountPct, label: found.label });
      setCodeError("");
    } else {
      setApplied(null);
      setCodeError("That code isn't valid or has expired.");
    }
  }

  function pay() {
    if (!draft) return;
    setPaying(true);
    const booking: Booking = {
      venueId: draft.venueId,
      venueName: draft.venueName,
      sport: draft.sport,
      dateISO: draft.dateISO,
      hours: draft.hours,
      pricePerSlot: draft.pricePerSlot,
      id: `BMB${Math.floor(100000 + Math.random() * 899999)}`,
      status: "confirmed",
      total: bill.total,
      createdAt: new Date().toISOString(),
    };
    setTimeout(() => {
      addBooking(booking);
      navigate({ to: "/booking/$bookingId", params: { bookingId: booking.id } });
    }, 900);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <h1 className="font-display text-3xl uppercase">Checkout</h1>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
              Your details
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(["name", "phone", "email"] as const).map((field) => (
                <label key={field} className="text-sm">
                  <span className="mb-1 block capitalize text-muted-foreground">{field}</span>
                  <input
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full rounded-xl border border-input bg-elevated px-3 py-2.5 outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
              Payment method
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-pressed={method === m.id}
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    method === m.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-elevated hover:border-primary/50",
                  )}
                >
                  <m.icon className={cn("h-5 w-5", method === m.id ? "text-primary" : "text-muted-foreground")} />
                  <p className="mt-2 font-display text-sm uppercase">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.hint}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Demo checkout — no real payment is processed.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
              Offer code
            </h2>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="FIRSTGAME"
                className="flex-1 rounded-xl border border-input bg-elevated px-3 py-2.5 text-sm uppercase outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applyCode}
                className="rounded-xl border border-primary px-4 text-xs font-bold uppercase tracking-wide text-primary"
              >
                Apply
              </button>
            </div>
            {applied && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-primary"
              >
                {applied.label} applied
              </motion.p>
            )}
            {codeError && (
              <motion.p
                initial={{ x: -6 }}
                animate={{ x: 0 }}
                className="mt-2 text-sm text-destructive"
              >
                {codeError}
              </motion.p>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg uppercase">{draft.venueName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{prettyDate(draft.dateISO)}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {[...draft.hours]
                .sort((a, b) => a - b)
                .map((h) => (
                  <li key={h} className="flex justify-between">
                    <span className="text-muted-foreground">{formatHour(h)}</span>
                    <span>{inr(draft.pricePerSlot[h] ?? 0)}</span>
                  </li>
                ))}
            </ul>
            <hr className="my-4 border-border" />
            <dl className="space-y-2 text-sm">
              <Row label={`Subtotal (${draft.hours.length} hr)`} value={inr(bill.subtotal)} />
              {bill.discount > 0 && (
                <Row label="Discount" value={`- ${inr(bill.discount)}`} accent />
              )}
              <Row label="Convenience fee" value={inr(bill.convenienceFee)} />
              <Row label="GST (18%)" value={inr(bill.taxes)} />
            </dl>
            <hr className="my-4 border-border" />
            <div className="flex items-center justify-between">
              <span className="font-display text-sm uppercase text-muted-foreground">Total</span>
              <span className="font-display text-2xl">{inr(bill.total)}</span>
            </div>
            <MagneticButton onClick={pay} disabled={paying} className="mt-5 w-full">
              {paying ? "Confirming…" : `Pay ${inr(bill.total)}`}
            </MagneticButton>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Free cancellation up to 6 hours before start time.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={accent ? "text-primary" : ""}>{value}</dd>
    </div>
  );
}
