import { Star } from 'lucide-react';

/**
 * Per-star count histogram for a box's reviews. `counts` is the
 * server-computed `{"1": n, ..., "5": n}` breakdown (BoxDetailSerializer's
 * rating_breakdown) rather than a full review list tallied client-side —
 * the review list itself is paginated now (see BoxDetails.jsx), so an
 * accurate histogram can no longer assume every review is already loaded.
 */
export function RatingBreakdown({ counts }) {
    const total = [5, 4, 3, 2, 1].reduce((sum, star) => sum + (counts?.[star] ?? 0), 0);

    return (
        <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
                const count = counts?.[star] ?? 0;
                const percentage = total > 0 ? (count / total) * 100 : 0;
                return (
                    <div key={star} className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 w-10 shrink-0 text-foreground">
                            {star}
                            <Star size={12} className="fill-warning text-warning" />
                        </span>
                        <div className="flex-1 bg-elevated rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{count}</span>
                    </div>
                );
            })}
        </div>
    );
}
