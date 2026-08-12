import { Star } from 'lucide-react';

/**
 * Per-star count histogram for a box's reviews — tallies `reviews` (each
 * with a 1-5 `rating`) client-side, since the full review list is already
 * delivered on `box.reviews` and a new endpoint would just duplicate that
 * data. Same bar-row visual as the "Top performing cities" pattern in the
 * admin/owner dashboards, for consistency.
 */
export function RatingBreakdown({ reviews }) {
    const counts = [5, 4, 3, 2, 1].reduce((acc, star) => {
        acc[star] = 0;
        return acc;
    }, {});
    reviews.forEach((review) => {
        if (counts[review.rating] !== undefined) counts[review.rating] += 1;
    });
    const total = reviews.length;

    return (
        <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
                const count = counts[star];
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
