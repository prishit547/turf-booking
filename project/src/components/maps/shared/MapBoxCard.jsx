import { motion } from 'framer-motion';
import { Star, Navigation } from 'lucide-react';
import { calculateDistance } from './geo';

// A single box entry in the map sidebar list. sportLabel is passed in for
// the same reason as BoxMarkerPopup — callers' box shapes disagree on
// whether it's a `sport` string or a `sports` array.
const MapBoxCard = ({ box, sportLabel, isSelected, userLocation, onClick }) => (
    <motion.div
        whileHover={{ translateY: -3, boxShadow: "0 8px 16px rgba(0,0,0,0.1)" }}
        transition={{ duration: 0.2 }}
        className={`p-5 bg-white rounded-xl border cursor-pointer transition-all duration-200 ease-in-out ${
            isSelected ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={onClick}
    >
        <div className="flex items-start justify-between mb-3">
            <h4 className="font-bold text-lg text-gray-900">{box.name}</h4>
            <div className="flex items-center text-sm font-semibold text-gray-800">
                <Star size={16} className="text-yellow-500 fill-current mr-1" />
                <span>{box.rating ? box.rating.toFixed(1) : 'N/A'}</span>
            </div>
        </div>

        <p className="text-sm text-gray-600 mb-3 leading-snug">{sportLabel}</p>

        <div className="flex items-center justify-between text-base mb-3">
            <span className="text-primary-700 font-bold">₹{box.price}/hr</span>
            {userLocation && box.coordinates && (
                <span className="text-gray-600 flex items-center gap-1">
                    <Navigation size={14} className="transform rotate-90" />
                    {calculateDistance(
                        userLocation.lat, userLocation.lng,
                        box.coordinates[0], box.coordinates[1]
                    ).toFixed(1)} km
                </span>
            )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {box.amenities && box.amenities.slice(0, 3).map((amenity) => (
                <span
                    key={amenity}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full shadow-sm"
                >
                    {amenity}
                </span>
            ))}
            {box.amenities && box.amenities.length > 3 && (
                <span className="px-3 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded-full shadow-sm">
                    +{box.amenities.length - 3} more
                </span>
            )}
        </div>
    </motion.div>
);

export default MapBoxCard;
