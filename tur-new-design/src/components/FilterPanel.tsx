import { sports, amenityList, type Amenity, type SportId } from "@/data/mock";
import { SportIcon } from "@/components/SportIcon";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/store";

export type Filters = {
  sports: SportId[];
  maxPrice: number;
  maxDistance: number;
  minRating: number;
  amenities: Amenity[];
  setting: "all" | "indoor" | "outdoor";
};

export const defaultFilters: Filters = {
  sports: [],
  maxPrice: 2000,
  maxDistance: 15,
  minRating: 0,
  amenities: [],
  setting: "all",
};

export function FilterPanel({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">Sport</h3>
        <div className="flex flex-wrap gap-2">
          {sports.map((sport) => {
            const active = filters.sports.includes(sport.id);
            return (
              <button
                key={sport.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...filters, sports: toggle(filters.sports, sport.id) })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                <SportIcon sport={sport.id} className="h-3.5 w-3.5" />
                {sport.name}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase tracking-wide text-muted-foreground">
          Max price / hour
        </h3>
        <input
          type="range"
          min={500}
          max={2000}
          step={50}
          value={filters.maxPrice}
          onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
          className="w-full accent-primary"
          aria-label="Maximum price per hour"
        />
        <p className="mt-1 text-sm text-primary">up to {inr(filters.maxPrice)}</p>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase tracking-wide text-muted-foreground">
          Max distance
        </h3>
        <input
          type="range"
          min={1}
          max={15}
          value={filters.maxDistance}
          onChange={(e) => onChange({ ...filters, maxDistance: Number(e.target.value) })}
          className="w-full accent-primary"
          aria-label="Maximum distance in kilometres"
        />
        <p className="mt-1 text-sm text-primary">within {filters.maxDistance} km</p>
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">Rating</h3>
        <div className="flex gap-2">
          {[0, 4, 4.5, 4.8].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={filters.minRating === r}
              onClick={() => onChange({ ...filters, minRating: r })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                filters.minRating === r
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {r === 0 ? "Any" : `${r}+`}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">Setting</h3>
        <div className="flex gap-2">
          {(["all", "indoor", "outdoor"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.setting === s}
              onClick={() => onChange({ ...filters, setting: s })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs capitalize transition",
                filters.setting === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">
          Amenities
        </h3>
        <div className="flex flex-wrap gap-2">
          {amenityList.map((a) => {
            const active = filters.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...filters, amenities: toggle(filters.amenities, a) })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {a}
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={() => onChange(defaultFilters)}
        className="w-full rounded-full border border-border py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
      >
        Reset filters
      </button>
    </div>
  );
}
