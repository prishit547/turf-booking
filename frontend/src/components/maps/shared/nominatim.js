// nominatim.js
//
// Thin fetch wrappers around OpenStreetMap's free Nominatim geocoding API.
//
// NOTE: calling nominatim.openstreetmap.org directly from the browser is
// against Nominatim's usage policy for production use (their policy asks
// for a descriptive `User-Agent`/`Referer` identifying the app, which a
// browser `fetch` can't set — the browser controls that header). This is
// acceptable here per an explicit product decision: this only powers the
// low-frequency admin/owner "add a box" location picker, not a
// consumer-facing high-traffic search. Debounce stays generous (~450ms)
// and results are capped (`limit=5`) specifically to keep request volume
// low. A server-side geocode-proxy view would be the correct long-term fix
// if this ever needs to scale up — not built this round.
//
// Both functions are best-effort UX only — they must never throw, since a
// flaky/rate-limited geocoder should never block the box-creation form.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export async function searchAddress(query) {
    if (!query || !query.trim()) return [];
    try {
        const response = await fetch(
            `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        );
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

export async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}`,
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data && !data.error ? data : null;
    } catch {
        return null;
    }
}
