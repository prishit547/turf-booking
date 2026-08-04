import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, MapPin, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SportBadge } from "@/components/SportBadge";
import { RatingStars } from "@/components/RatingStars";
import { DateStrip } from "@/components/DateStrip";
import { SlotGrid, SlotLegend } from "@/components/SlotGrid";
import { SlotGridSkeleton } from "@/components/Skeletons";
import { BookingSummaryBar } from "@/components/BookingSummaryBar";
import { getReviews, getSlots, getVenue } from "@/data/mock";
import { inr, useStore } from "@/lib/store";
import { prettyDate, todayISO } from "@/lib/dates";
import { toast } from "sonner";

export const Route = createFileRoute("/venues/$venueId")({
  loader: ({ params }) => {
    const venue = getVenue(params.venueId);
    if (!venue) throw notFound();
    return { venue };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Venue unavailable | BookmyBox" }, { name: "robots", content: "noindex" }] };
    }
    const v = loaderData.venue;
    const title = `${v.name}, ${v.area} — Book by the Hour | BookmyBox`;
    const description = `${v.name} in ${v.area}, ${v.city}. ${inr(v.pricePerHour)}/hour, live slot availability and instant confirmation.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: VenueDetail,
});

function VenueDetail() {
  const { venueId } = Route.useParams();
  const venue = getVenue(venueId)!;
  const navigate = useNavigate();
  const { setDraft, blockedSlots } = useStore();
  const [dateISO, setDateISO] = useState(todayISO());
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelected([]);
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, [dateISO]);

  const ownerBlocked = blockedSlots[`${venue.id}|${dateISO}`] ?? [];
  const slots = useMemo(
    () =>
      getSlots(venue.id, dateISO).map((s) =>
        ownerBlocked.includes(s.hour) ? { ...s, status: "blocked" as const } : s,
      ),
    [venue.id, dateISO, ownerBlocked],
  );

  const priceMap = useMemo(
    () => Object.fromEntries(slots.map((s) => [s.hour, s.price])) as Record<number, number>,
    [slots],
  );
  const total = selected.reduce((sum, h) => sum + (priceMap[h] ?? 0), 0);
  const venueReviews = getReviews(venue.id);

  function toggleSlot(hour: number) {
    setSelected((prev) =>
      prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour].sort((a, b) => a - b),
    );
  }

  function continueToBook() {
    setDraft({
      venueId: venue.id,
      venueName: venue.name,
      sport: venue.sports[0]!,
      dateISO,
      hours: selected,
      pricePerSlot: Object.fromEntries(selected.map((h) => [h, priceMap[h] ?? 0])),
    });
    toast.success(`${selected.length} slot${selected.length > 1 ? "s" : ""} held for 10 minutes`);
    navigate({ to: "/checkout" });
  }

  return (
    <div className="min-h-screen pb-28">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Link to="/venues" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> All venues
        </Link>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {venue.images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightbox(img)}
              className={`group relative overflow-hidden rounded-2xl border border-border ${i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}
            >
              <img
                src={img}
                alt={`${venue.name} photo ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                width={1024}
                height={768}
                className="h-48 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-full"
              />
            </button>
          ))}
        </div>

        <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl uppercase sm:text-4xl">{venue.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {venue.address}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {venue.sports.map((s) => (
                <SportBadge key={s} sport={s} tone="turf" />
              ))}
              <span className="rounded-full bg-elevated px-2.5 py-1 text-xs text-muted-foreground">
                {venue.indoor ? "Indoor" : "Outdoor"}
              </span>
            </div>
          </div>
          <RatingStars rating={venue.rating} count={venue.reviewCount} className="text-base" />
        </header>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{venue.about}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <section>
            <h2 className="font-display text-2xl uppercase">Pick your slots</h2>
            <div className="mt-4">
              <DateStrip value={dateISO} onChange={setDateISO} />
            </div>
            <div className="mt-5">{loading ? <SlotGridSkeleton /> : <SlotGrid slots={slots} selected={selected} onToggle={toggleSlot} />}</div>
            <div className="mt-4">
              <SlotLegend />
            </div>

            <h2 className="mt-12 font-display text-2xl uppercase">Reviews</h2>
            <div className="mt-4 space-y-3">
              {venueReviews.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No reviews yet — be the first to play here.
                </p>
              )}
              {venueReviews.map((r) => (
                <article key={r.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-sm uppercase">{r.author}</p>
                    <RatingStars rating={r.rating} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.date} · <SportBadge sport={r.sport} />
                  </p>
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Pricing
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Off-peak (before 6 PM)</dt>
                  <dd className="font-semibold">{inr(venue.pricePerHour)}/hr</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Peak (6–11 PM)</dt>
                  <dd className="font-semibold text-primary">{inr(venue.peakPricePerHour)}/hr</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-sm uppercase tracking-wide text-muted-foreground">
                Amenities
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {venue.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-1.5 text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-primary" /> {a}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative h-40 overflow-hidden rounded-2xl border border-border bg-elevated">
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px)",
                  backgroundSize: "38px 38px",
                }}
              />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-glow">
                {venue.area}
              </span>
            </div>
          </aside>
        </div>
      </div>

      <BookingSummaryBar
        hours={selected}
        total={total}
        dateLabel={prettyDate(dateISO)}
        onContinue={continueToBook}
      />

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              aria-label="Close gallery"
              className="absolute right-5 top-5 text-foreground"
              onClick={() => setLightbox(null)}
            >
              <X className="h-6 w-6" />
            </button>
            <motion.img
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              src={lightbox}
              alt={`${venue.name} full size`}
              className="max-h-[85vh] w-auto rounded-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}
