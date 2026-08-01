import { Star, DollarSign, Navigation } from 'lucide-react';
import { calculateDistance } from './geo';

// Popup content for a box marker. sportLabel is passed in rather than
// derived here since callers disagree on shape: BoxListingsMap's boxes
// have a single `sport` string, NearbyBoxesMap's have a `sports` array.
// The "View Details" action is passed as children so each caller can use
// whatever navigation primitive fits (a router <Link>, a button+onClick).
const BoxMarkerPopup = ({ box, sportLabel, userLocation, children }) => (
    <div className="min-w-56 p-2">
        <h3 className="font-bold text-lg text-gray-900 mb-2">{box.name}</h3>
        <div className="space-y-1 text-sm text-gray-700">
            <div className="flex items-center">
                <Star size={16} className="text-yellow-500 fill-current mr-2" />
                <span>{box.rating ? box.rating.toFixed(1) : 'N/A'}</span>
            </div>
            <div className="flex items-center">
                <DollarSign size={16} className="text-green-600 mr-2" />
                <span>₹{box.price}/hr</span>
            </div>
            <p className="text-gray-600 font-medium">{sportLabel}</p>
            {userLocation && box.coordinates && (
                <p className="text-primary-600 font-semibold flex items-center">
                    <Navigation size={16} className="mr-2 transform rotate-90 text-primary-500" />
                    {calculateDistance(
                        userLocation.lat, userLocation.lng,
                        box.coordinates[0], box.coordinates[1]
                    ).toFixed(1)} km away
                </p>
            )}
        </div>
        {children}
    </div>
);

export default BoxMarkerPopup;
