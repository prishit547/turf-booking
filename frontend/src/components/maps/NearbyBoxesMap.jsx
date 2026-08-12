import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';
import { MapPin, AlertCircle, X } from 'lucide-react';
import { useBox } from '../../context/BoxContext';
import { Button, Loader } from '../ui';
import { toast } from 'react-toastify';

import { DARK_TILE_URL, DARK_TILE_ATTRIBUTION } from './shared/tileLayer';
import { createBoxIcon, createUserLocationIcon } from './shared/markerIcons';
import MapControlsPanel from './shared/MapControlsPanel';
import BoxMarkerPopup from './shared/BoxMarkerPopup';
import MapBoxCard from './shared/MapBoxCard';
import RecenterMap from './shared/RecenterMap';

const MUMBAI_DEFAULT = { lat: 19.0760, lng: 72.8777 };
const userLocationIcon = createUserLocationIcon();

const NearbyBoxesMap = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [userLocation, setUserLocation] = useState(null);
    const [selectedBox, setSelectedBox] = useState(null);
    const [searchRadius, setSearchRadius] = useState(20); // Default search radius in km

    const [mapCenter, setMapCenter] = useState(MUMBAI_DEFAULT);
    const [mapZoom, setMapZoom] = useState(13);

    const { nearbyBoxes, fetchNearbyBoxes, loadingMap, errorMap } = useBox();
    const loading = loadingMap.nearby;
    const error = errorMap.nearby;

    // Fetch user location
    useEffect(() => {
        if (!isOpen) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    setUserLocation(loc);
                    setMapCenter(loc);
                },
                (err) => {
                    console.error("Location error:", err.message);
                    let userFriendlyMessage = "We couldn't retrieve your exact location. ";
                    switch (err.code) {
                        case err.PERMISSION_DENIED:
                            userFriendlyMessage += "You denied permission to access your location. To see boxes near you, please allow location access in your browser settings.";
                            break;
                        case err.POSITION_UNAVAILABLE:
                            userFriendlyMessage += "Your location information is currently unavailable. This might be due to network issues or your device settings.";
                            break;
                        case err.TIMEOUT:
                            userFriendlyMessage += "The request to get your location timed out. Please ensure you have a stable internet connection or try again.";
                            break;
                        default:
                            userFriendlyMessage += "An unexpected error occurred while trying to find your location.";
                    }
                    userFriendlyMessage += " Defaulting to Mumbai for search results.";
                    toast.warning(userFriendlyMessage);

                    setUserLocation(MUMBAI_DEFAULT);
                    setMapCenter(MUMBAI_DEFAULT);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            toast.warning("Geolocation is not supported by this browser. Defaulting to Mumbai.");
            setUserLocation(MUMBAI_DEFAULT);
            setMapCenter(MUMBAI_DEFAULT);
        }
    }, [isOpen]);

    // Fetch nearby boxes when location or radius changes
    useEffect(() => {
        if (userLocation) {
            fetchNearbyBoxes(userLocation.lat, userLocation.lng, searchRadius);
        }
    }, [userLocation, searchRadius, fetchNearbyBoxes]);

    // Escape-to-close, matching ui/Modal's behavior.
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    // Function to re-center map on a specific box
    const handleSelectBox = (box) => {
        setSelectedBox(box);
        if (box.coordinates) {
            setMapCenter({ lat: box.coordinates[0], lng: box.coordinates[1] });
            setMapZoom(15);
        }
    };

    const handleViewDetails = (boxId) => {
        onClose?.();
        navigate(`/boxes/${boxId}`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-background/80 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="bg-card border border-border rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col shadow-xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                        <h2 className="text-3xl font-display font-semibold text-foreground flex items-center gap-2">
                            <MapPin size={28} className="text-primary" /> Nearby Sports Boxes
                        </h2>
                        <p className="text-muted-foreground mt-1">Discover and book sports facilities near you.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 text-muted-foreground hover:text-foreground hover:bg-elevated rounded-full transition-colors duration-200"
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Map Area */}
                    <div className="flex-1 relative leaflet-dark">
                        <MapContainer
                            center={[mapCenter.lat, mapCenter.lng]}
                            zoom={mapZoom}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <RecenterMap center={[mapCenter.lat, mapCenter.lng]} zoom={mapZoom} />
                            <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTRIBUTION} />

                            {/* User location marker */}
                            {userLocation && (
                                <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />
                            )}

                            {/* Render nearby boxes as markers */}
                            {nearbyBoxes.filter((box) => box.coordinates).map((box) => (
                                <Marker
                                    key={box.id}
                                    position={[box.coordinates[0], box.coordinates[1]]}
                                    icon={createBoxIcon({ selected: selectedBox?.id === box.id })}
                                    eventHandlers={{ click: () => handleSelectBox(box) }}
                                />
                            ))}

                            {/* Popup for selected box */}
                            {selectedBox && selectedBox.coordinates && (
                                <Popup
                                    position={[selectedBox.coordinates[0], selectedBox.coordinates[1]]}
                                    eventHandlers={{ remove: () => setSelectedBox(null) }}
                                >
                                    <BoxMarkerPopup
                                        box={selectedBox}
                                        sportLabel={selectedBox.sports.join(', ')}
                                        userLocation={userLocation}
                                    >
                                        <Button onClick={() => handleViewDetails(selectedBox.id)} size="sm" fullWidth className="mt-4">
                                            View Details
                                        </Button>
                                    </BoxMarkerPopup>
                                </Popup>
                            )}
                        </MapContainer>

                        <MapControlsPanel searchRadius={searchRadius} onSearchRadiusChange={setSearchRadius} />
                    </div>

                    {/* Sidebar */}
                    <div className="w-96 border-l border-border bg-card flex flex-col overflow-hidden">
                        <div className="p-6 flex-shrink-0 border-b border-border">
                            <h3 className="font-display font-semibold text-2xl text-foreground flex items-center gap-2">
                                <MapPin size={24} className="text-muted-foreground" />
                                Nearby Boxes ({loading ? '...' : nearbyBoxes.length})
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {loading ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <Loader size="lg" />
                                    <p className="text-lg text-foreground font-medium mt-4">Finding nearby boxes...</p>
                                    <p className="text-sm text-muted-foreground mt-1">This might take a moment.</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <AlertCircle size={60} className="text-danger mb-5" />
                                    <p className="text-xl text-danger font-bold mb-2">Error Loading Boxes</p>
                                    <p className="text-foreground text-base">{error}</p>
                                    <p className="text-sm text-muted-foreground mt-2">Please check your internet connection or try again later.</p>
                                </div>
                            ) : nearbyBoxes.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <MapPin size={60} className="text-muted-foreground mb-5" />
                                    <p className="text-xl text-foreground font-bold mb-2">No Sports Boxes Found</p>
                                    <p className="text-base text-muted-foreground">Try increasing the search radius or adjusting your location.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {nearbyBoxes.map((box) => (
                                        <MapBoxCard
                                            key={box.id}
                                            box={box}
                                            sportLabel={box.sports.join(', ')}
                                            isSelected={selectedBox?.id === box.id}
                                            userLocation={userLocation}
                                            onClick={() => handleSelectBox(box)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default NearbyBoxesMap;
