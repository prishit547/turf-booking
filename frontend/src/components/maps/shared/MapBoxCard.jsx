import { motion } from 'framer-motion';
import { Star, Navigation } from 'lucide-react';
import { calculateDistance } from './geo';

// A single box entry in the map sidebar list — a compact sibling of
// components/boxes/BoxCard.jsx (same rating/price/tag visual language,
// condensed for a narrow sidebar). sportLabel is passed in for the same
// reason as BoxMarkerPopup — callers' box shapes disagree on whether it's
// a `sport` string or a `sports` array.
const MapBoxCard = ({ box, sportLabel, isSelected, userLocation, onClick }) => (
    <motion.div
        whileHover={{ translateY: -3, boxShadow: '0 18px 50px -18px rgba(209,251,0,0.4)' }}
        transition={{ duration: 0.2 }}
        className={`p-5 rounded-2xl border cursor-pointer transition-colors duration-200 ${
            isSelected
                ? 'border-primary bg-primary/10'
                : 'bg-card border-border hover:border-primary/50'
        }`}
        onClick={onClick}
    >
        <div className="flex items-start justify-between mb-3 gap-2">
            <h4 className="font-display font-semibold text-lg text-foreground line-clamp-1">{box.name}</h4>
            <div className="flex items-center text-sm font-semibold text-foreground shrink-0">
                <Star size={16} className="text-warning fill-warning mr-1" />
                <span>{box.rating ? box.rating.toFixed(1) : 'N/A'}</span>
            </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3 leading-snug">{sportLabel}</p>

        <div className="flex items-center justify-between text-base mb-3">
            <span className="text-primary font-bold">₹{box.price}/hr</span>
            {userLocation && box.coordinates && (
                <span className="text-muted-foreground flex items-center gap-1">
                    <Navigation size={14} className="rotate-90" />
                    {calculateDistance(
                        userLocation.lat, userLocation.lng,
                        box.coordinates[0], box.coordinates[1]
                    ).toFixed(1)} km
                </span>
            )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {box.amenities && box.amenities.slice(0, 3).map((amenity) => (
                <span
                    key={amenity}
                    className="px-3 py-1 bg-elevated text-foreground text-xs font-medium rounded-full"
                >
                    {amenity}
                </span>
            ))}
            {box.amenities && box.amenities.length > 3 && (
                <span className="px-3 py-1 bg-elevated text-foreground text-xs font-medium rounded-full">
                    +{box.amenities.length - 3} more
                </span>
            )}
        </div>
    </motion.div>
);

export default MapBoxCard;
