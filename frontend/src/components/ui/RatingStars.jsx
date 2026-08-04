import { Star } from 'lucide-react';

/**
 * Compact inline rating — one filled lime star + numeric rating + optional
 * review count. Not a 5-star row; the reference reserves that pattern for
 * review-list entries only (see BoxDetails' review cards).
 */
export function RatingStars({ rating, count, size = 14, className = '' }) {
    const value = Number(rating) || 0;
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
