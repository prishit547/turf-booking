import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Heart, MapPin, Zap } from "lucide-react";
import { SportBadge } from "@/components/SportBadge";
import { RatingStars } from "@/components/RatingStars";
import { inr, useStore } from "@/lib/store";
import type { Venue } from "@/data/mock";
import { cn } from "@/lib/utils";

export function VenueCard({ venue, layout = "grid" }: { venue: Venue; layout?: "grid" | "list" }) {
  const { favourites, toggleFavourite } = useStore();
  const isFav = favourites.includes(venue.id);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-glow",
        layout === "list" && "sm:flex",
      )}
    >
      <div className={cn("relative overflow-hidden", layout === "list" ? "sm:w-64" : "")}>
        <img
          src={venue.images[0]}
          alt={`${venue.name} — ${venue.area}`}
          loading="lazy"
          width={1024}
          height={768}
          className={cn(
            "h-44 w-full object-cover transition-transform duration-700 group-hover:scale-110",
            layout === "list" && "sm:h-full",
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <button
          type="button"
          onClick={() => toggleFavourite(venue.id)}
          aria-label={isFav ? `Remove ${venue.name} from favourites` : `Save ${venue.name}`}
          aria-pressed={isFav}
          className="absolute right-3 top-3 rounded-full bg-background/70 p-2 backdrop-blur transition hover:bg-background"
        >
          <Heart className={cn("h-4 w-4", isFav ? "fill-primary text-primary" : "text-foreground")} />
        </button>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/75 px-2.5 py-1 text-xs font-medium text-primary backdrop-blur">
          <Zap className="h-3 w-3" /> {venue.indoor ? "Indoor" : "Outdoor"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg leading-tight">{venue.name}</h3>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {venue.area}, {venue.city} · {venue.distanceKm} km
            </p>
          </div>
          <RatingStars rating={venue.rating} count={venue.reviewCount} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {venue.sports.map((s) => (
            <SportBadge key={s} sport={s} tone="turf" />
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-display text-xl text-foreground">{inr(venue.pricePerHour)}</span>
            /hour
          </p>
          <Link
            to="/venues/$venueId"
            params={{ venueId: venue.id }}
            className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90"
          >
            Check availability
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
