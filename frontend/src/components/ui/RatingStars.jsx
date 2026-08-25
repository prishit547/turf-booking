import { Star } from 'lucide-react';

/**
 * Compact inline rating — one filled lime star + numeric rating + optional
 * review count. Not a 5-star row; the reference reserves that pattern for
 * review-list entries only (see BoxDetails' review cards).
 *
 * When `count` is explicitly 0 (as opposed to omitted, which means "not
 * tracked here" — e.g. a single review row always has a real rating), this
 * renders "New" instead of a filled star next to "0.0". A brand-new box
 * with no reviews yet has no rating at all, and showing a lit star with
 * "0.0" reads as the worst possible score rather than "unrated" — actively
 * penalizing an owner's first box in the listings grid.
 */
export function RatingStars({ rating, count, size = 14, className = '' }) {
    const value = Number(rating) || 0;
    if (count === 0) {
        return (
            <div className={`inline-flex items-center gap-1 text-sm ${className}`}>
                <span className="font-medium text-muted-foreground">New</span>
            </div>
        );
    }
    return (
        <div className={`inline-flex items-center gap-1 text-sm ${className}`}>
            <Star size={size} className="text-primary fill-primary" />
            <span className="font-medium text-foreground">{value.toFixed(1)}</span>
            {typeof count === 'number' && (
                <span className="text-muted-foreground">({count})</span>
            )}
        </div>
    );
}
