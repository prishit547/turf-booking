import { useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { motion } from 'framer-motion';
import { MapPin, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

import { createCustomIcon } from './shared/mapIcons';
import { calculateDistance } from './shared/geo';
import LocationMarker from './shared/LocationMarker';
import MapControlsPanel from './shared/MapControlsPanel';
import BoxMarkerPopup from './shared/BoxMarkerPopup';
import MapBoxCard from './shared/MapBoxCard';

const BoxListingsMap = ({ isOpen, onClose, boxes = [] }) => {
    const [userLocation, setUserLocation] = useState(null);
    const [selectedBox, setSelectedBox] = useState(null);
    const [searchRadius, setSearchRadius] = useState(20); // Default search radius in km
    const mapRef = useRef();

    const handleLocationFound = useCallback((location) => {
        setUserLocation(location);
    }, []);

    // Function to re-center map on a specific box
    const handleSelectBox = (box) => {
        setSelectedBox(box);
        if (mapRef.current && box.coordinates) {
            mapRef.current.flyTo(box.coordinates, 15);
        }
    };

    // Filter boxes by radius from user location
    const getFilteredBoxes = () => {
        if (!userLocation) {
            // If no user location, show all boxes with coordinates
            return boxes.filter(box =>
                box.coordinates &&
                Array.isArray(box.coordinates) &&
                box.coordinates.length === 2 &&
                !isNaN(box.coordinates[0]) &&
                !isNaN(box.coordinates[1])
            );
        }

        return boxes.filter(box => {
            if (!box.coordinates || !Array.isArray(box.coordinates) || box.coordinates.length !== 2) {
                return false;
            }

            const distance = calculateDistance(
                userLocation.lat, userLocation.lng,
                box.coordinates[0], box.coordinates[1]
            );

            return distance <= searchRadius;
        });
    };

    const filteredBoxes = getFilteredBoxes();

    // Calculate center of all boxes or use user location
    const getMapCenter = () => {
        if (userLocation) {
            return [userLocation.lat, userLocation.lng];
        }

        if (filteredBoxes.length === 0) {
            return [19.0760, 72.8777]; // Mumbai default
        }

        const latSum = filteredBoxes.reduce((sum, box) => sum + box.coordinates[0], 0);
        const lngSum = filteredBoxes.reduce((sum, box) => sum + box.coordinates[1], 0);

        return [latSum / filteredBoxes.length, lngSum / filteredBoxes.length];
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
                            <MapPin size={28} className="text-primary-600" /> Sports Boxes Map
                        </h2>
                        <p className="text-gray-600 mt-1">View and discover sports facilities with radius search.</p>
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
                            center={getMapCenter()}
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

                            {/* Render filtered sports boxes as markers */}
                            {filteredBoxes.map((box) => (
                                <Marker
                                    key={box.id}
                                    position={box.coordinates}
                                    icon={createCustomIcon('#10b981', selectedBox?.id === box.id)}
                                    eventHandlers={{
                                        click: () => handleSelectBox(box)
                                    }}
                                >
                                    <Popup>
                                        <BoxMarkerPopup box={box} sportLabel={box.sport} userLocation={userLocation}>
                                            <Link to={`/boxes/${box.id}`}>
                                                <button className="mt-4 w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors font-semibold">
                                                    View Details
                                                </button>
                                            </Link>
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
                                Sports Boxes ({filteredBoxes.length})
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            {filteredBoxes.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <MapPin size={60} className="text-gray-400 mb-5" />
                                    <p className="text-xl text-gray-700 font-bold mb-2">No Sports Boxes Found</p>
                                    <p className="text-base text-gray-600">Try increasing the search radius or adjusting your location.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredBoxes.map((box) => (
                                        <MapBoxCard
                                            key={box.id}
                                            box={box}
                                            sportLabel={box.sport}
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
