import { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { motion } from 'framer-motion';
import { MapPin, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';
import { toast } from 'react-toastify';

import { DARK_MODE_STYLES } from './shared/googleMapStyles';
import { calculateDistance } from './shared/geo';
import MapControlsPanel from './shared/MapControlsPanel';
import BoxMarkerPopup from './shared/BoxMarkerPopup';
import MapBoxCard from './shared/MapBoxCard';

const MUMBAI_DEFAULT = { lat: 19.0760, lng: 72.8777 };

const BoxListingsMap = ({ isOpen, onClose, boxes = [] }) => {
    const [userLocation, setUserLocation] = useState(null);
    const [selectedBox, setSelectedBox] = useState(null);
    const [searchRadius, setSearchRadius] = useState(20); // Default search radius in km

    const [mapCenter, setMapCenter] = useState(MUMBAI_DEFAULT);
    const [mapZoom, setMapZoom] = useState(13);

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const hasApiKey = apiKey && apiKey !== 'your_google_maps_api_key_here';

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
                            userFriendlyMessage += "You denied permission to access your location. To filter boxes near you, please allow location access in your browser settings.";
                            break;
                        default:
                            userFriendlyMessage += "An error occurred while finding your location.";
                    }
                    userFriendlyMessage += " Defaulting to Mumbai.";
                    toast.warning(userFriendlyMessage);
                    setUserLocation(MUMBAI_DEFAULT);
                    setMapCenter(MUMBAI_DEFAULT);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            setUserLocation(MUMBAI_DEFAULT);
            setMapCenter(MUMBAI_DEFAULT);
        }
    }, [isOpen]);

    // Escape-to-close, matching ui/Modal's behavior.
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    // Filter boxes by radius from user location
    const getFilteredBoxes = () => {
        const coordsBoxes = boxes.filter(box =>
            box.coordinates &&
            Array.isArray(box.coordinates) &&
            box.coordinates.length === 2 &&
            !isNaN(box.coordinates[0]) &&
            !isNaN(box.coordinates[1])
        );

        if (!userLocation) {
            return coordsBoxes;
        }

        return coordsBoxes.filter(box => {
            const distance = calculateDistance(
                userLocation.lat, userLocation.lng,
                box.coordinates[0], box.coordinates[1]
            );
            return distance <= searchRadius;
        });
    };

    const filteredBoxes = getFilteredBoxes();

    // Re-center map to specific box
    const handleSelectBox = (box) => {
        setSelectedBox(box);
        if (box.coordinates) {
            setMapCenter({ lat: box.coordinates[0], lng: box.coordinates[1] });
            setMapZoom(15);
        }
    };

    if (!isOpen) return null;

    const mapStyles = DARK_MODE_STYLES;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
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
                            <MapPin size={28} className="text-primary" /> Map Listings
                        </h2>
                        <p className="text-muted-foreground mt-1">Check sports facilities on map and find distance from your location.</p>
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
                    <div className="flex-1 relative">
                        {hasApiKey ? (
                            <APIProvider apiKey={apiKey}>
                                <div style={{ height: '100%', width: '100%' }}>
                                    <Map
                                        center={mapCenter}
                                        zoom={mapZoom}
                                        onCenterChanged={(ev) => setMapCenter(ev.detail.center)}
                                        onZoomChanged={(ev) => setMapZoom(ev.detail.zoom)}
                                        mapId="DEMO_MAP_ID"
                                        options={{
                                            styles: mapStyles,
                                            disableDefaultUI: false,
                                            fullscreenControl: false,
                                            mapTypeControl: false,
                                        }}
                                    >
                                        {/* User location marker */}
                                        {userLocation && (
                                            <AdvancedMarker position={userLocation}>
                                                <div className="w-8 h-8 rounded-full border-2 border-white bg-turf shadow-lg flex items-center justify-center animate-pulse">
                                                    <span className="text-white text-xs">👤</span>
                                                </div>
                                            </AdvancedMarker>
                                        )}

                                        {/* Render boxes as markers */}
                                        {filteredBoxes.map((box) => {
                                            const boxPos = { lat: box.coordinates[0], lng: box.coordinates[1] };
                                            return (
                                                <AdvancedMarker
                                                    key={box.id}
                                                    position={boxPos}
                                                    onClick={() => handleSelectBox(box)}
                                                >
                                                    <div className={`w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center transition-all cursor-pointer ${selectedBox?.id === box.id ? 'scale-125 bg-amber-500 z-10' : 'bg-primary'}`}>
                                                        <span className="text-white text-[10px]">📍</span>
                                                    </div>
                                                </AdvancedMarker>
                                            );
                                        })}

                                        {/* InfoWindow for selected box */}
                                        {selectedBox && (
                                            <InfoWindow
                                                position={{ lat: selectedBox.coordinates[0], lng: selectedBox.coordinates[1] }}
                                                onCloseClick={() => setSelectedBox(null)}
                                            >
                                                <BoxMarkerPopup
                                                    box={selectedBox}
                                                    sportLabel={selectedBox.sport || 'Multi-sport'}
                                                    userLocation={userLocation}
                                                >
                                                    <Link
                                                        to={`/boxes/${selectedBox.id}`}
                                                        onClick={onClose}
                                                        className="block mt-4 text-center"
                                                    >
                                                        <Button size="sm" fullWidth>
                                                            View Details
                                                        </Button>
                                                    </Link>
                                                </BoxMarkerPopup>
                                            </InfoWindow>
                                        )}
                                    </Map>
                                </div>
                            </APIProvider>
                        ) : (
                            <div className="w-full h-full bg-elevated flex flex-col items-center justify-center p-6 text-center border border-border m-2 rounded-xl">
                                <MapPin size={48} className="text-muted-foreground mb-4 animate-bounce" />
                                <h4 className="text-xl font-semibold text-foreground mb-2">Google Maps API Key Required</h4>
                                <p className="text-muted-foreground max-w-sm mb-4">
                                    To display the interactive map of boxes, please add your Google Maps API Key to the <code>.env</code> file:
                                </p>
                                <pre className="bg-elevated text-foreground p-3 rounded-lg text-sm select-all mb-4">
                                    VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
                                </pre>
                                <p className="text-xs text-muted-foreground max-w-xs">
                                    You can obtain an API key from the Google Maps Platform Console. Make sure to enable the Maps JavaScript API.
                                </p>
                            </div>
                        )}

                        <MapControlsPanel searchRadius={searchRadius} onSearchRadiusChange={setSearchRadius} />
                    </div>

                    {/* Sidebar */}
                    <div className="w-96 border-l border-border bg-card flex flex-col overflow-hidden">
                        <div className="p-6 flex-shrink-0 border-b border-border">
                            <h3 className="font-display font-semibold text-2xl text-foreground flex items-center gap-2">
                                <MapPin size={24} className="text-muted-foreground" />
                                Boxes Found ({filteredBoxes.length})
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {filteredBoxes.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <MapPin size={60} className="text-muted-foreground mb-5" />
                                    <p className="text-xl text-foreground font-bold mb-2">No Boxes Found</p>
                                    <p className="text-base text-muted-foreground">Try increasing the search radius or adjusting your location.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredBoxes.map((box) => (
                                        <MapBoxCard
                                            key={box.id}
                                            box={box}
                                            sportLabel={box.sport || 'Multi-sport'}
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

export default BoxListingsMap;
