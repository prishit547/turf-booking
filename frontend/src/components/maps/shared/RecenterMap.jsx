import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// react-leaflet's MapContainer only takes center/zoom as *initial* values
// (uncontrolled) — this drives the map imperatively whenever center/zoom
// state changes (geolocation resolving, a box being selected), mirroring
// the old Google Maps <Map center zoom> controlled-prop behavior.
export default function RecenterMap({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}
