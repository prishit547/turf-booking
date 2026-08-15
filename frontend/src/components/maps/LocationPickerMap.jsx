import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

import { Input } from '../ui';
import { useDebounce } from '../../hooks/useDebounce';
import { DARK_TILE_URL, DARK_TILE_ATTRIBUTION } from './shared/tileLayer';
import { createBoxIcon } from './shared/markerIcons';
import RecenterMap from './shared/RecenterMap';
import { searchAddress, reverseGeocode } from './shared/nominatim';

const MUMBAI_DEFAULT = { lat: 19.0760, lng: 72.8777 };
const SEARCH_DEBOUNCE_MS = 450;

const pickerIcon = createBoxIcon({ selected: true });

// Lives inside <MapContainer> so it can call useMapEvents — same reason
// RecenterMap is split out as its own child component (react-leaflet v4's
// hooks only work inside the MapContainer's context, not in the parent).
function ClickToPlace({ onPick }) {
    useMapEvents({
        click: (e) => onPick(e.latlng),
    });
    return null;
}

/**
 * Address search (debounced, Nominatim-backed) + a draggable/clickable
 * Leaflet marker for picking a box's location. Controlled component:
 * `value` is `{ location, latitude, longitude }` (matching AddBoxForm's
 * formData shape exactly), `onChange(next)` is called with a partial patch
 * of that same shape whenever the location changes.
 */
export default function LocationPickerMap({ value, onChange }) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searching, setSearching] = useState(false);
    const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
    const searchTokenRef = useRef(0);

    const latitude = value?.latitude;
    const longitude = value?.longitude;
    const hasCoords = latitude !== '' && latitude !== null && latitude !== undefined
        && longitude !== '' && longitude !== null && longitude !== undefined
        && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));
    const center = hasCoords ? { lat: Number(latitude), lng: Number(longitude) } : MUMBAI_DEFAULT;

    // Only fire a search once the user is actively typing in the search
    // box — not on every re-render triggered by a marker drag/click, which
    // also updates `value.location` (and would otherwise cause a search
    // suggestions dropdown to pop back open after a selection).
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.trim().length < 3) {
            setSuggestions([]);
            setSearching(false);
            return;
        }
        const token = ++searchTokenRef.current;
        setSearching(true);
        searchAddress(debouncedQuery.trim()).then((results) => {
            // Ignore stale responses from an earlier, since-superseded query.
            if (searchTokenRef.current !== token) return;
            setSuggestions(results);
            setSearching(false);
        });
    }, [debouncedQuery]);

    const handleQueryChange = (e) => {
        setQuery(e.target.value);
        setShowSuggestions(true);
    };

    const handleSelectSuggestion = (suggestion) => {
        onChange({
            location: suggestion.display_name,
            latitude: suggestion.lat,
            longitude: suggestion.lon,
        });
        setQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleLatLng = ({ lat, lng }) => {
        // Set coordinates immediately — never block the form on the
        // reverse-geocode round trip, which is best-effort only.
        onChange({ location: value?.location, latitude: lat, longitude: lng });
        reverseGeocode(lat, lng).then((result) => {
            if (result?.display_name) {
                onChange({ location: result.display_name, latitude: lat, longitude: lng });
            }
        });
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <Input
                    label="Search for an address"
                    leadingIcon={<MapPin size={16} />}
                    placeholder="Search an address, landmark, or area..."
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && (searching || suggestions.length > 0) && (
                    <ul className="absolute z-[1000] mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                        {searching && suggestions.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">Searching...</li>
                        )}
                        {suggestions.map((suggestion) => (
                            <li key={`${suggestion.lat}-${suggestion.lon}`}>
                                <button
                                    type="button"
                                    onClick={() => handleSelectSuggestion(suggestion)}
                                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-elevated transition-colors"
                                >
                                    {suggestion.display_name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div>
                {value?.location && (
                    <p className="text-sm text-muted-foreground mb-1.5 flex items-start gap-1.5">
                        <MapPin size={14} className="mt-0.5 shrink-0" />
                        <span>{value.location}</span>
                    </p>
                )}
                <div className="h-64 rounded-lg overflow-hidden border border-border leaflet-dark">
                    <MapContainer center={[center.lat, center.lng]} zoom={hasCoords ? 15 : 11} style={{ height: '100%', width: '100%' }}>
                        <RecenterMap center={[center.lat, center.lng]} zoom={hasCoords ? 15 : 11} />
                        <TileLayer url={DARK_TILE_URL} attribution={DARK_TILE_ATTRIBUTION} />
                        <Marker
                            position={[center.lat, center.lng]}
                            icon={pickerIcon}
                            draggable
                            eventHandlers={{
                                dragend: (e) => handleLatLng(e.target.getLatLng()),
                            }}
                        />
                        <ClickToPlace onPick={handleLatLng} />
                    </MapContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                    Drag the pin or click anywhere on the map to fine-tune the exact location.
                </p>
            </div>
        </div>
    );
}
