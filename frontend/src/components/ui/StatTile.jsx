import { Card } from './Card';
import { SkeletonLine } from './Skeleton';

// Tone -> class map. Deliberately a literal lookup rather than interpolated
// class names (`bg-${tone}-100`), which Tailwind's JIT scanner can't see and
// would silently drop from the build.
const TILE_TONE = {
    primary: 'bg-primary/15 text-primary',
    secondary: 'bg-turf/15 text-turf',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    neutral: 'bg-elevated text-muted-foreground',
};

/**
 * Canonical dashboard stat tile — icon in a tinted rounded square, a large
 * font-display number, a muted label. Shared by User/Owner/Admin dashboards
 * so the three don't drift apart.
 *
 * Tone is chosen by semantics, not decoration: primary = headline count,
 * success = positive trend, warning = rating, danger = something that should
 * trend down (e.g. cancellation rate).
 */
export function StatTile({ icon, tone = 'primary', value, label, loading = false }) {
    return (
        <Card padding="md" className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${TILE_TONE[tone]}`}>
                {icon}
            </div>
            <div className="min-w-0">
                {loading ? (
                    <SkeletonLine width="w-16" className="mb-1.5" />
                ) : (
                    <div className="font-display text-2xl sm:text-3xl text-foreground tabular-nums truncate">
                        {value}
                    </div>
                )}
                <div className="text-sm text-muted-foreground mt-0.5 truncate">{label}</div>
            </div>
        </Card>
    );
}
