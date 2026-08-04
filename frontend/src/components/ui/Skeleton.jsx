const base = 'animate-pulse bg-elevated rounded';

/**
 * Loading-skeleton primitives — three dashboards full of stat tiles/tables
 * is exactly where a skeleton reads as production-grade and a bare
 * spinner-in-a-box reads as unfinished.
 */
export function SkeletonLine({ width = 'w-full', className = '' }) {
    return <div className={`${base} h-3.5 ${width} ${className}`} />;
}

export function SkeletonBlock({ className = 'h-24 w-full' }) {
    return <div className={`${base} ${className}`} />;
}

export function SkeletonCircle({ size = 'w-10 h-10', className = '' }) {
    return <div className={`${base} rounded-full ${size} ${className}`} />;
}

/** Brand-toned sweeping shimmer block — used for image-heavy skeletons
 * (venue cards, slot grids) where a flat pulse reads as too generic. */
export function ShimmerBlock({ className = 'h-24 w-full', rounded = 'rounded-2xl' }) {
    return <div className={`bmb-shimmer ${rounded} ${className}`} />;
}

/** Skeleton matching BoxCard's layout: image + two text lines + price row. */
export function VenueCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <ShimmerBlock className="h-48 w-full" rounded="rounded-none" />
            <div className="p-4 space-y-3">
                <ShimmerBlock className="h-4 w-3/4" rounded="rounded" />
                <ShimmerBlock className="h-3 w-1/2" rounded="rounded" />
                <ShimmerBlock className="h-8 w-full" rounded="rounded-full" />
            </div>
        </div>
    );
}

/** Skeleton matching SlotGrid's pill-button layout while slots load. */
export function SlotGridSkeleton({ count = 9 }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: count }).map((_, i) => (
                <ShimmerBlock key={i} className="h-10 w-full" rounded="rounded-lg" />
            ))}
        </div>
    );
}
