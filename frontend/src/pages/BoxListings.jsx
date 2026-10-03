import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, List, Map, Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useBox } from '../context/BoxContext';
import { useDebounce } from '../hooks/useDebounce';
import { Input, VenueCardSkeleton } from '../components/ui';
import { BoxCard } from '../components/boxes/BoxCard';
import { FilterPanel, defaultFilters } from '../components/boxes/FilterPanel';
import BoxListingsMap from '../components/maps/BoxListingsMap';

const BoxListings = () => {
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [location, setLocation] = useState(searchParams.get('location') || 'all');
    const [sort, setSort] = useState('rating');
    const [layout, setLayout] = useState('grid');
    const [showMap, setShowMap] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [filters, setFiltersState] = useState({
        ...defaultFilters,
        sport: searchParams.get('sport') || '',
    });

    const { boxes, loadingMap, errorMap } = useBox();
    // Loading/error reflect only BoxProvider's one-time initial fetch (it
    // loads the full box list once on app mount, no pagination) — every
    // filter below runs entirely client-side against that already-loaded
    // list, exactly like the reference design's useMemo-based filtering.
    // Sending each filter change to the backend instead would flip this
    // whole grid to a loading-skeleton state on every click, which is what
    // was killing the animated re-flow (AnimatePresence + layout) below.
    const loading = loadingMap.boxes;
    const error = errorMap.boxes;
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    // The price slider fires onChange continuously while dragging (unlike
    // the sport/rating/amenity pills, which are one click = one change).
    // Feeding every one of those straight into `results` floods the
    // animated grid below with far more layout/AnimatePresence updates
    // than a 0.35s transition can settle between, which is what caused
    // cards to visibly glitch/overshoot when the slider was dragged fast —
    // same class of problem the search box comment above already flags,
    // just from a different input. Debounced here, same as search; the
    // slider's own label still reads the live (non-debounced) value below
    // so dragging itself stays instant, only the expensive re-filter lags.
    const debouncedMaxPrice = useDebounce(filters.maxPrice, 150);

    const amenityOptions = useMemo(() => {
        const set = new Set();
        boxes.forEach((b) => (b.amenities || []).forEach((a) => set.add(a)));
        return [...set].sort();
    }, [boxes]);

    // Derived from boxes that actually exist, not a static wishlist of
    // cities — a hardcoded list here used to offer 14 cities when only a
    // handful ever had a real listing, so most selections landed on a dead
    // "no results" page with a misleading suggestion to loosen price/rating.
    const locationOptions = useMemo(
        () => [...new Set(boxes.map((b) => (b.location || '').split(',')[0].trim()).filter(Boolean))].sort(),
        [boxes]
    );

    const results = useMemo(() => {
        const q = debouncedSearchTerm.trim().toLowerCase();
        const list = boxes.filter((b) => {
            if (location !== 'all' && !(b.location || '').toLowerCase().includes(location.toLowerCase())) return false;
            if (filters.sport && b.sport !== filters.sport) return false;
            if ((parseFloat(b.price) || 0) > debouncedMaxPrice) return false;
            if ((parseFloat(b.rating) || 0) < filters.minRating) return false;
            if (filters.amenities.length && !filters.amenities.every((a) => (b.amenities || []).includes(a))) return false;
            if (q) {
                const haystack = `${b.name || ''} ${b.location || ''} ${b.sport || ''}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
        return [...list].sort((a, b) => {
            if (sort === 'price-low') return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
            if (sort === 'price-high') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
            return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        });
    }, [boxes, location, filters.sport, debouncedMaxPrice, filters.minRating, filters.amenities, debouncedSearchTerm, sort]);

    const clearAllFilters = useCallback(() => {
        setSearchTerm('');
        setLocation('all');
        setFiltersState(defaultFilters);
    }, []);

    return (
        <div className="min-h-screen">
            <Helmet>
                <title>Browse Sports Boxes & Cricket Turfs - BoxNplay</title>
                <meta name="description" content="Browse cricket, football, badminton, and other sports boxes by location, sport, price, and rating. Book instantly online on BoxNplay." />
                <link rel="canonical" href="https://boxnplay.com/boxes" />
                <meta property="og:title" content="Browse Sports Boxes & Cricket Turfs - BoxNplay" />
                <meta property="og:description" content="Browse cricket, football, badminton, and other sports boxes by location, sport, price, and rating. Book instantly online on BoxNplay." />
                <meta property="og:url" content="https://boxnplay.com/boxes" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Browse Sports Boxes & Cricket Turfs - BoxNplay" />
                <meta name="twitter:description" content="Browse cricket, football, badminton, and other sports boxes by location, sport, price, and rating. Book instantly online on BoxNplay." />
            </Helmet>
            <div className="mx-auto max-w-7xl px-4 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="font-display text-3xl uppercase sm:text-4xl">Boxes</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {loading ? 'Checking live availability…' : `${results.length} boxes match your filters`}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            aria-label="Location"
                            className="rounded-full border border-border bg-card px-4 py-2 text-sm"
                        >
                            <option value="all">All locations</option>
                            {locationOptions.map((l) => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                        </select>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            aria-label="Sort by"
                            className="rounded-full border border-border bg-card px-4 py-2 text-sm"
                        >
                            <option value="rating">Top rated</option>
                            <option value="price-low">Lowest price</option>
                            <option value="price-high">Highest price</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setShowMap(true)}
                            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                        >
                            <Map className="h-4 w-4" /> Map
                        </button>
                        <div className="flex overflow-hidden rounded-full border border-border">
                            {['grid', 'list'].map((l) => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => setLayout(l)}
                                    aria-label={`${l} view`}
                                    aria-pressed={layout === l}
                                    className={`px-3 py-2 transition ${layout === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                                >
                                    {l === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
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

                <div className="mt-4 max-w-xl">
                    <Input
                        leadingIcon={<Search size={18} />}
                        placeholder="Search by name, sport, or location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
                            <FilterPanel filters={filters} onChange={setFiltersState} amenityOptions={amenityOptions} />
                        </div>
                    </aside>

                    <main>
                        {loading ? (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <VenueCardSkeleton key={i} />
                                ))}
                            </div>
                        ) : error ? (
                            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                                <h2 className="font-display text-xl">Something went wrong</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                                <h2 className="font-display text-xl">No boxes match that combination</h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {location !== 'all'
                                        ? `There's no box in ${location} yet — try another city, or clear the location filter.`
                                        : 'Loosen the price or rating filter — there are plenty of slots nearby.'}
                                </p>
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground"
                                >
                                    Reset everything
                                </button>
                            </div>
                        ) : (
                            <motion.div
                                layout
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                className={`grid gap-4 ${layout === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}
                            >
                                <AnimatePresence mode="popLayout">
                                    {results.map((box) => (
                                        <BoxCard key={box.id} box={box} layout={layout} />
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </main>
                </div>
            </div>

            <BoxListingsMap isOpen={showMap} onClose={() => setShowMap(false)} boxes={results} />

            <AnimatePresence>
                {drawerOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-background/80 backdrop-blur lg:hidden"
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="font-display text-lg uppercase">Filters</h2>
                                <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close filters">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <FilterPanel filters={filters} onChange={setFiltersState} amenityOptions={amenityOptions} />
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground"
                            >
                                Show {results.length} boxes
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BoxListings;
