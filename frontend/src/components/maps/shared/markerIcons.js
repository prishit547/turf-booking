// markerIcons.js
import L from 'leaflet';
import { MARKER_COLORS } from './MapControlsPanel';

// Classic teardrop pin as inline SVG (not an emoji — emoji glyphs render
// inconsistently/ugly across OS+browser font stacks). Punched-out center
// dot mirrors the legend swatch color exactly so pins never drift out of
// sync with MapControlsPanel's Legend.
export function createBoxIcon({ selected }) {
    const color = selected ? MARKER_COLORS.userLocation : MARKER_COLORS.box;
    const scale = selected ? 1.15 : 1;
    return L.divIcon({
        className: 'bg-transparent border-0',
        html: `<div style="transform: scale(${scale}); transform-origin: bottom center; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.55));" class="transition-transform duration-200">
            <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.716 23.284 0 15 0z" fill="${color}" stroke="rgba(9,10,12,0.35)" stroke-width="1"/>
                <circle cx="15" cy="15" r="6" fill="#090A0C"/>
            </svg>
        </div>`,
        iconSize: [30, 38],
        iconAnchor: [15, 38],
        popupAnchor: [0, -36],
    });
}

// "You are here" pulsing dot (Google/Uber-style), not a pin — this marks a
// live position, not a place, so it shouldn't compete visually with box pins.
export function createUserLocationIcon() {
    return L.divIcon({
        className: 'bg-transparent border-0',
        html: `<div class="relative flex items-center justify-center" style="width:22px;height:22px">
            <span class="absolute inline-flex h-full w-full rounded-full animate-ping" style="background-color:${MARKER_COLORS.userLocation}; opacity:0.5;"></span>
            <span class="relative inline-flex rounded-full border-2 border-white shadow-lg" style="width:14px;height:14px;background-color:${MARKER_COLORS.userLocation};"></span>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11],
    });
}
