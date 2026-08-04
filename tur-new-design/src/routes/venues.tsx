import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Map, SlidersHorizontal, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { VenueCard } from "@/components/VenueCard";
import { VenueCardSkeleton } from "@/components/Skeletons";
import { FilterPanel, defaultFilters, type Filters } from "@/components/FilterPanel";
import { venues, cities, type SportId } from "@/data/mock";
import { cn } from "@/lib/utils";

type VenueSearch = { sport?: SportId | undefined; city?: string | undefined; date?: string | undefined };

export const Route = createFileRoute("/venues")({
  validateSearch: (search: Record<string, unknown>): VenueSearch => ({
    sport: typeof search["sport"] === "string" ? (search["sport"] as SportId) : undefined,
    city: typeof search["city"] === "string" ? (search["city"] as string) : undefined,
    date: typeof search["date"] === "string" ? (search["date"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Browse Sports Venues & Turfs Near You | BookmyBox" },
      {
        name: "description",
        content:
          "Filter turfs and courts by sport, price, distance, rating and amenities. See live hourly availability and book instantly.",
      },
      { property: "og:title", content: "Browse Sports Venues & Turfs | BookmyBox" },
      {
        property: "og:description",
        content: "Compare grounds by price, distance and amenities, then book by the hour.",
      },
    ],
  }),
  component: VenuesPage,
});

type SortKey = "nearest" | "price" | "rating";

function VenuesPage() {
  const search = Route.useSearch();
  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    sports: search.sport ? [search.sport] : [],
  });
  const [city, setCity] = useState<string>(search.city ?? "all");
  const [sort, setSort] = useState<SortKey>("nearest");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [showMap, setShowMap] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  const results = useMemo(() => {
    const list = venues.filter((v) => {
      if (city !== "all" && v.city !== city) return false;
      if (filters.sports.length && !filters.sports.some((s) => v.sports.includes(s))) return false;
      if (v.pricePerHour > filters.maxPrice) return false;
      if (v.distanceKm > filters.maxDistance) return false;
      if (v.rating < filters.minRating) return false;
      if (filters.setting === "indoor" && !v.indoor) return false;
      if (filters.setting === "outdoor" && v.indoor) return false;
      if (filters.amenities.length && !filters.amenities.every((a) => v.amenities.includes(a)))
        return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "price") return a.pricePerHour - b.pricePerHour;
      if (sort === "rating") return b.rating - a.rating;
      return a.distanceKm - b.distanceKm;
    });
  }, [filters, city, sort]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl uppercase sm:text-4xl">Venues</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "Checking live availability…" : `${results.length} grounds match your filters`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-label="City"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="all">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort by"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm"
            >
              <option value="nearest">Nearest first</option>
              <option value="price">Lowest price</option>
              <option value="rating">Top rated</option>
            </select>
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              aria-pressed={showMap}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                showMap ? "border-primary text-primary" : "border-border text-muted-foreground",
              )}
            >
              <Map className="h-4 w-4" /> Map
            </button>
            <div className="flex overflow-hidden rounded-full border border-border">
              {(["grid", "list"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayout(l)}
                  aria-label={`${l} view`}
                  aria-pressed={layout === l}
                  className={cn(
                    "px-3 py-2",
                    layout === l ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {l === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </button>
          </div>
        </header>

        <AnimatePresence>
          {showMap && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="relative mt-6 h-64 overflow-hidden rounded-2xl border border-border bg-elevated">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "linear-gradient(color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 80%, transparent) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                  }}
                />
                {results.map((v, i) => (
                  <span
                    key={v.id}
                    className="absolute -translate-x-1/2 -translate-y-full"
                    style={{ left: `${12 + i * 14}%`, top: `${30 + (i % 3) * 20}%` }}
                  >
                    <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-glow">
                      {v.name}
                    </span>
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
          </aside>

          <main>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <VenueCardSkeleton key={i} />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <h2 className="font-display text-xl">No grounds match that combination</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Loosen the price or distance filter — there are plenty of slots nearby.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilters(defaultFilters);
                    setCity("all");
                  }}
                  className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
                >
                  Reset everything
                </button>
              </div>
            ) : (
              <motion.div
                layout
                className={cn(
                  "grid gap-4",
                  layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
                )}
              >
                <AnimatePresence mode="popLayout">
                  {results.map((venue) => (
                    <VenueCard key={venue.id} venue={venue} layout={layout} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur lg:hidden"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 240, damping: 26 }}
              className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg uppercase">Filters</h2>
                <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close filters">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <FilterPanel filters={filters} onChange={setFilters} />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground"
              >
                Show {results.length} venues
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}
