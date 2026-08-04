import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Star, MapPin, Users, Heart } from 'lucide-react'
import { toast } from 'react-toastify'
import { Card, Button } from '../ui'
import { api, useAuth } from '../../api.jsx'

/**
 * Canonical box card — shared by Home's featured/trending sections and
 * BoxListings' grid view, so the two don't drift into separate visual
 * languages the way the old per-page hand-rolled cards did.
 *
 * The favorite heart is optimistic and self-contained: it doesn't fetch
 * per-card favorite status up front (would be an N+1 call across a whole
 * grid), it just reflects whatever the user does in this session, wired to
 * the same /dashboard/favorites/ endpoints BoxDetails.jsx uses.
 */
export function BoxCard({ box, compact = false }) {
    const { isAuthenticated } = useAuth();
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);

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
        <Card interactive padding="none" className="overflow-hidden h-full flex flex-col group">
            <div className="relative overflow-hidden">
                <img
                    src={box.image}
                    alt={box.name}
                    className={`w-full object-cover transition-transform duration-700 group-hover:scale-110 ${compact ? 'h-36' : 'h-52'}`}
                />
                <div className="absolute top-3 left-3 bg-card/90 backdrop-blur px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide text-foreground">
                    {box.sport || 'Multi-sport'}
                </div>
                <motion.button
                    onClick={toggleFavorite}
                    disabled={favoriteLoading}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    whileTap={{ scale: 0.9 }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/90 backdrop-blur flex items-center justify-center text-foreground hover:text-primary transition-colors disabled:opacity-60"
                >
                    <Heart size={16} className={isFavorite ? 'fill-primary text-primary' : ''} />
                </motion.button>
                <div className="absolute bottom-3 right-3 bg-primary text-primary-foreground rounded-md px-2.5 py-1.5 text-right leading-none shadow-glow">
                    <div className="text-[10px] uppercase tracking-wide opacity-80">From</div>
                    <div className="font-display text-base leading-none mt-0.5">₹{box.price}</div>
                </div>
            </div>
            <div className={`flex flex-col flex-1 ${compact ? 'p-4' : 'p-5'}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-foreground line-clamp-1">
                        {box.name}
                    </h3>
                    <span className="flex items-center gap-1 text-sm font-medium text-foreground shrink-0">
                        <Star size={14} className="text-warning fill-warning" />
                        {box.rating}
                    </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">₹{box.price}/hr</p>

                {!compact && (
                    <div className="space-y-1.5 mb-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <MapPin size={14} />
                            {box.location}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            Up to {box.capacity} players
                        </div>
                    </div>
                )}

                {!compact && (
                    <div className="mt-auto pt-2">
                        <Button as={Link} to={`/boxes/${box.id}`} size="sm" variant="outline" fullWidth>
                            Find out more
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    )
}
