import { useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { toast } from 'react-toastify';
import { createCustomIcon } from './mapIcons';

const MUMBAI_DEFAULT = { lat: 19.0760, lng: 72.8777 };

// Locates the user via the browser geolocation API (through Leaflet's
// map.locate()), falling back to Mumbai with a toast explaining why on
// permission-denied/unavailable/timeout — shared by every map that shows
// a "your location" marker.
const LocationMarker = ({ userLocation, onLocationFound }) => {
    const map = useMap();

    useEffect(() => {
        if (!userLocation) {
            map.locate({ setView: true, maxZoom: 13, enableHighAccuracy: true })
                .on('locationfound', (e) => {
                    onLocationFound({ lat: e.latlng.lat, lng: e.latlng.lng });
                    map.flyTo(e.latlng, map.getZoom());
                })
                .on('locationerror', (e) => {
                    console.error("Location error:", e.message);
                    let userFriendlyMessage = "We couldn't retrieve your exact location. ";

                    switch (e.code) {
                        case e.PERMISSION_DENIED:
                            userFriendlyMessage += "You denied permission to access your location. To see boxes near you, please allow location access for this site in your browser settings.";
                            break;
                        case e.POSITION_UNAVAILABLE:
                            userFriendlyMessage += "Your location information is currently unavailable. This might be due to network issues or your device settings.";
                            break;
                        case e.TIMEOUT:
                            userFriendlyMessage += "The request to get your location timed out. Please ensure you have a stable internet connection or try again.";
                            break;
                        default:
                            userFriendlyMessage += "An unexpected error occurred while trying to find your location.";
                    }
                    userFriendlyMessage += " Defaulting to Mumbai for search results.";

                    toast.warning(userFriendlyMessage);

                    map.setView([MUMBAI_DEFAULT.lat, MUMBAI_DEFAULT.lng], 13);
                    onLocationFound(MUMBAI_DEFAULT);
                });
        } else {
            map.setView([userLocation.lat, userLocation.lng], map.getZoom());
        }
    }, [map, userLocation, onLocationFound]);

    if (!userLocation) return null;

    return (
        <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={createCustomIcon('#ef4444')} // Red for user location
        >
            <Popup>
                <div className="text-center font-semibold">
                    Your Location 📍
                </div>
            </Popup>
        </Marker>
    );
};

export default LocationMarker;
