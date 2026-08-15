import { CricketIcon, FootballIcon, TennisIcon, BadmintonIcon, BasketballIcon, PickleballIcon } from '../icons/SportIcons';

const SPORTS = [
    { id: 'Cricket', name: 'Cricket', Icon: CricketIcon },
    { id: 'Football', name: 'Football', Icon: FootballIcon },
    { id: 'Tennis', name: 'Tennis', Icon: TennisIcon },
    { id: 'Badminton', name: 'Badminton', Icon: BadmintonIcon },
    { id: 'Basketball', name: 'Basketball', Icon: BasketballIcon },
    { id: 'Pickleball', name: 'Pickleball', Icon: PickleballIcon },
];

export const defaultFilters = {
    sport: '',
    maxPrice: 2000,
    minRating: 0,
    amenities: [],
};

/**
 * Sidebar/drawer filter panel, mirroring the reference design's
 * FilterPanel exactly — sport pills, a price-range slider, rating
 * quick-select, and amenity pills. Only real, backend-honored filters are
 * included: BoxNplay has no distance/geo filtering on the main listing
 * endpoint (only a separate "nearby" endpoint) and no indoor/outdoor field
 * on the box model, so those reference sections are intentionally omitted
 * rather than faked.
 */
export function FilterPanel({ filters, onChange, amenityOptions = [] }) {
    const toggleAmenity = (a) => {
        onChange({
            ...filters,
            amenities: filters.amenities.includes(a)
                ? filters.amenities.filter((x) => x !== a)
                : [...filters.amenities, a],
        });
    };

    return (
        <div className="space-y-6">
            <section>
                <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">Sport</h3>
                <div className="flex flex-wrap gap-2">
                    {SPORTS.map(({ id, name, Icon }) => {
                        const active = filters.sport === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onChange({ ...filters, sport: active ? '' : id })}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                    active
                                        ? 'border-primary bg-primary/15 text-primary'
                                        : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground'
                                }`}
                            >
                                <Icon size={14} />
                                {name}
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
                    min={200}
                    max={2000}
                    step={50}
                    value={filters.maxPrice}
                    onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
                    className="w-full accent-primary"
                    aria-label="Maximum price per hour"
                />
                <p className="mt-1 text-sm text-primary">up to ₹{filters.maxPrice}</p>
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
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                filters.minRating === r
                                    ? 'border-primary bg-primary/15 text-primary'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {r === 0 ? 'Any' : `${r}+`}
                        </button>
                    ))}
                </div>
            </section>

            {amenityOptions.length > 0 && (
                <section>
                    <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-muted-foreground">
                        Amenities
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {amenityOptions.map((a) => {
                            const active = filters.amenities.includes(a);
                            return (
                                <button
                                    key={a}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => toggleAmenity(a)}
                                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                                        active
                                            ? 'border-primary bg-primary/15 text-primary'
                                            : 'border-border bg-card text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {a}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

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
