// Preference order: an owner/admin-supplied link is an exact, human-picked
// map entry and always wins. Failing that, a precise lat/lng deep-links
// straight to the point. A free-text address is the fuzziest fallback, for
// boxes nobody ever geocoded or linked.
export const getGoogleMapsUrl = ({ googleMapsUrl, latitude, longitude, location }) => {
    if (googleMapsUrl) {
        return googleMapsUrl;
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    if (location) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    }
    return null;
};
