import { forwardRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, MapPin, Zap } from 'lucide-react'
import { toast } from 'react-toastify'
import { RatingStars } from '../ui'
import { api, useAuth } from '../../api.jsx'

/**
 * Canonical box card — mirrors the reference design's VenueCard exactly:
 * image with bottom gradient, favorite heart + sport pill overlays, then a
 * title/rating row, price + "Check availability" CTA footer. Supports a
 * `layout` prop ("grid" | "list") the way VenueCard does, so this one
 * component covers both BoxListings view modes instead of a separate
 * hand-rolled list card.
 *
 * Must forward its ref: BoxListings renders this inside
 * `AnimatePresence mode="popLayout"`, which attaches a ref to each child to
 * measure it during exit so siblings can reflow immediately. Without
 * forwardRef here, that ref attachment silently fails (a plain function
 * component can't hold a ref) and breaks the whole enter/exit choreography
 * for every card, not just the ones being removed.
 *
 * The favorite heart is optimistic and self-contained: it doesn't fetch
 * per-card favorite status up front (would be an N+1 call across a whole
 * grid), it just reflects whatever the user does in this session, wired to
 * the same /dashboard/favorites/ endpoints BoxDetails.jsx uses.
 */
export const BoxCard = forwardRef(function BoxCard({ box, layout = 'grid' }, ref) {
    const { isAuthenticated } = useAuth();
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const isList = layout === 'list';

    const toggleFavorite = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) {
            toast.info('Please login to add to favorites');
            return;
        }
        setFavoriteLoading(true);
        try {
            if (isFavorite) {
                await api.delete(`/dashboard/favorites/${box.id}/remove/`);
                toast.success('Removed from favorites');
                setIsFavorite(false);
            } else {
                await api.post('/dashboard/favorites/', { box_id: box.id });
                toast.success('Added to favorites!');
                setIsFavorite(true);
            }
            window.dispatchEvent(new Event('favorite-added'));
        } catch {
            toast.error('Could not update favorites');
        } finally {
            setFavoriteLoading(false);
        }
    };

    return (
        <motion.article
            ref={ref}
            layout
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6 }}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-glow ${isList ? 'sm:flex' : ''}`}
        >
            <div className={`relative overflow-hidden ${isList ? 'sm:w-64' : ''}`}>
                <img
                    src={box.image}
                    alt={`${box.name} — ${box.location}`}
                    loading="lazy"
                    className={`h-44 w-full object-cover transition-transform duration-700 group-hover:scale-110 ${isList ? 'sm:h-full' : ''}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <button
                    type="button"
                    onClick={toggleFavorite}
                    disabled={favoriteLoading}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    aria-pressed={isFavorite}
                    className="absolute right-3 top-3 rounded-full bg-background/70 p-2 backdrop-blur transition hover:bg-background disabled:opacity-60"
                >
                    <Heart className={`h-4 w-4 ${isFavorite ? 'fill-primary text-primary' : 'text-foreground'}`} />
                </button>
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/75 px-2.5 py-1 text-xs font-medium text-primary backdrop-blur">
                    <Zap className="h-3 w-3" /> {box.sport || 'Multi-sport'}
                </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-display text-lg leading-tight">{box.name}</h3>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" /> {box.location}
                        </p>
                    </div>
                    <RatingStars rating={box.rating || 0} count={box.review_count} />
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                        {box.pricing_rules?.length > 0 && <span className="mr-1">From</span>}
                        <span className="font-display text-xl text-foreground">₹{box.min_price ?? box.price}</span>
                        /hour
                        {box.pricing_rules?.length > 0 && (
                            <span className="ml-1.5 text-xs text-primary">· peak pricing</span>
                        )}
                    </p>
                    <Link
                        to={`/boxes/${box.id}`}
                        className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90"
                    >
                        Check availability
                    </Link>
                </div>
            </div>
        </motion.article>
    )
})
