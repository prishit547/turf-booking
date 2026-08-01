import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { motion } from 'framer-motion';
import { MapPin, AlertCircle, X } from 'lucide-react';
import { useBox } from '../../context/BoxContext';
import 'leaflet/dist/leaflet.css';

import { createCustomIcon } from './shared/mapIcons';
import LocationMarker from './shared/LocationMarker';
import MapControlsPanel from './shared/MapControlsPanel';
import BoxMarkerPopup from './shared/BoxMarkerPopup';
import MapBoxCard from './shared/MapBoxCard';

const NearbyBoxesMap = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [userLocation, setUserLocation] = useState(null);
    const [selectedBox, setSelectedBox] = useState(null);
    const [searchRadius, setSearchRadius] = useState(20); // Default search radius in km

    const { nearbyBoxes, fetchNearbyBoxes, loadingMap, errorMap } = useBox();
    const loading = loadingMap.nearby;
    const error = errorMap.nearby;

    const mapRef = useRef();

    const handleLocationFound = useCallback((location) => {
        setUserLocation(location);
    }, []);

    useEffect(() => {
        if (userLocation) {
            fetchNearbyBoxes(userLocation.lat, userLocation.lng, searchRadius);
        }
    }, [userLocation, searchRadius, fetchNearbyBoxes]);

    // Function to re-center map on a specific box
    const handleSelectBox = (box) => {
        setSelectedBox(box);
        if (mapRef.current && box.coordinates) {
            mapRef.current.flyTo(box.coordinates, 15);
        }
    };

    const handleViewDetails = (boxId) => {
        onClose?.();
        navigate(`/boxes/${boxId}`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col shadow-xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
                            <MapPin size={28} className="text-primary-600" /> Nearby Sports Boxes
                        </h2>
                        <p className="text-gray-600 mt-1">Discover and book sports facilities near you.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors duration-200"
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Map */}
                    <div className="flex-1 relative">
                        <MapContainer
                            ref={mapRef}
                            center={userLocation ? [userLocation.lat, userLocation.lng] : [19.0760, 72.8777]} // Default to Mumbai
                            zoom={13}
                            scrollWheelZoom={true}
                            style={{ height: '100%', width: '100%' }}
                            whenCreated={mapInstance => { mapRef.current = mapInstance; }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            <LocationMarker
                                userLocation={userLocation}
                                onLocationFound={handleLocationFound}
                            />

                            {/* Render nearby boxes as markers */}
                            {nearbyBoxes.map((box) => (
                                <Marker
                                    key={box.id}
                                    position={box.coordinates}
                                    icon={createCustomIcon('#10b981', selectedBox?.id === box.id)}
                                    eventHandlers={{
                                        click: () => handleSelectBox(box)
                                    }}
                                >
                                    <Popup>
                                        <BoxMarkerPopup box={box} sportLabel={box.sports.join(', ')} userLocation={userLocation}>
                                            <button
                                                onClick={() => handleViewDetails(box.id)}
                                                className="mt-4 w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors font-semibold"
                                            >
                                                View Details
                                            </button>
                                        </BoxMarkerPopup>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>

                        <MapControlsPanel searchRadius={searchRadius} onSearchRadiusChange={setSearchRadius} />
                    </div>

                    {/* Sidebar */}
                    <div className="w-96 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
                        <div className="p-6 flex-shrink-0 border-b border-gray-200">
                            <h3 className="font-bold text-2xl text-gray-900 flex items-center gap-2">
                                <MapPin size={24} className="text-gray-700" />
                                Nearby Boxes ({loading ? '...' : nearbyBoxes.length})
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            {loading ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <svg className="animate-spin h-10 w-10 text-primary-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <p className="text-lg text-gray-700 font-medium">Finding nearby boxes...</p>
                                    <p className="text-sm text-gray-500 mt-1">This might take a moment.</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <AlertCircle size={60} className="text-red-500 mb-5" />
                                    <p className="text-xl text-red-600 font-bold mb-2">Error Loading Boxes</p>
                                    <p className="text-gray-700 text-base">{error}</p>
                                    <p className="text-sm text-gray-500 mt-2">Please check your internet connection or try again later.</p>
                                </div>
                            ) : nearbyBoxes.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <MapPin size={60} className="text-gray-400 mb-5" />
                                    <p className="text-xl text-gray-700 font-bold mb-2">No Sports Boxes Found</p>
                                    <p className="text-base text-gray-600">Try increasing the search radius or adjusting your location.</p>
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
