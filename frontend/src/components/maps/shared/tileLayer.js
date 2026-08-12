// tileLayer.js

// CARTO's free "dark matter" raster basemap — no API key/billing account
// needed, and already close to the app's near-black/lime design system
// with minimal extra styling (replaces the old Google Maps DARK_MODE_STYLES).
// {r} pulls retina (@2x) tiles on high-DPI screens automatically.
export const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export const DARK_TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
    '&copy; <a href="https://carto.com/attributions">CARTO</a>';
