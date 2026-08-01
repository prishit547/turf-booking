// src/context/BoxContext.jsx

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api.jsx'; // Make sure this path is correct for your project

const BoxContext = createContext();

export const useBox = () => {
    const context = useContext(BoxContext);
    if (context === undefined) {
        throw new Error('useBox must be used within a BoxProvider');
    }
    return context;
};

// Fetches that each get their own independent loading/error slot, so one
// fetch finishing doesn't clobber another's in-flight state (e.g. Home page
// firing fetchFeaturedBoxes + fetchPopularBoxes at the same time).
const FETCH_KEYS = ['boxes', 'featured', 'popular', 'nearby', 'owner', 'pending'];
const EMPTY_STATE_MAP = Object.fromEntries(FETCH_KEYS.map(k => [k, false]));
const EMPTY_ERROR_MAP = Object.fromEntries(FETCH_KEYS.map(k => [k, null]));

export const BoxProvider = ({ children }) => {
    const [boxes, setBoxes] = useState([]);
    const [featuredBoxes, setFeaturedBoxes] = useState([]);
    const [popularBoxes, setPopularBoxes] = useState([]);
    const [nearbyBoxes, setNearbyBoxes] = useState([]);
    const [ownerBoxes, setOwnerBoxes] = useState([]);
    const [pendingBoxes, setPendingBoxes] = useState([]);
    const [loadingMap, setLoadingMap] = useState(EMPTY_STATE_MAP);
    const [errorMap, setErrorMap] = useState(EMPTY_ERROR_MAP);
    const [filters, setFilters] = useState({});

    const setLoadingFor = useCallback((key, value) => {
        setLoadingMap(prev => ({ ...prev, [key]: value }));
    }, []);
    const setErrorFor = useCallback((key, value) => {
        setErrorMap(prev => ({ ...prev, [key]: value }));
    }, []);

    // Backwards-compatible aggregate flags: true while ANY fetch is in
    // flight / if ANY fetch has an error. Prefer the keyed loadingMap/
    // errorMap in new code so unrelated fetches don't clobber each other.
    const loading = Object.values(loadingMap).some(Boolean);
    const error = Object.values(errorMap).find(Boolean) || null;

    const processBoxData = useCallback((boxesArray) => {
        if (!Array.isArray(boxesArray)) return [];
        return boxesArray.map(box => ({
            ...box,
            rating: box.rating !== null ? parseFloat(box.rating) : null,
            coordinates: (box.latitude && box.longitude) ? [parseFloat(box.latitude), parseFloat(box.longitude)] : null
        }));
    }, []);

    const fetchOwnerBoxes = useCallback(async () => {
        setLoadingFor('owner', true);
        setErrorFor('owner', null);
        try {
            const response = await api.get('/boxes/owner/');
            setOwnerBoxes(processBoxData(response.data.results || response.data));
        } catch (err) {
            console.error('Error fetching owner boxes:', err);
            setErrorFor('owner', 'Could not load your boxes.');
        } finally {
            setLoadingFor('owner', false);
        }
    }, [processBoxData, setLoadingFor, setErrorFor]);

    const addBox = useCallback(async (boxData) => {
        setLoadingFor('owner', true);
        setErrorFor('owner', null);
        const formData = new FormData();
        // Always send 'sport' as first selected sport for backend compatibility
        if (boxData.sports && boxData.sports.length > 0) {
            formData.append('sport', boxData.sports[0]);
        }
        Object.keys(boxData).forEach(key => {
            if (key === 'images' || key === 'sport') return;
            let value = boxData[key];
            // For amenities, sports, rules: always send as JSON string
            if (["amenities", "sports", "rules"].includes(key)) {
                formData.append(key, JSON.stringify(value));
            } else if (value !== null && value !== undefined) {
                formData.append(key, value);
            }
        });
        // Add all images (multi-upload)
        if (boxData.images && boxData.images.length > 0) {
            boxData.images.forEach((file, idx) => {
                formData.append('images', file); // backend should handle images as a list
                if (idx === 0) formData.append('image', file); // first image as main
            });
        }
        try {
            await api.post('/boxes/owner/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await fetchOwnerBoxes();
            return { success: true };
        } catch (err) {
            console.error('Error adding box:', err.response?.data);
            const errorMessage = err.response?.data?.detail || Object.values(err.response?.data || {})[0]?.[0] || 'Failed to add the box.';
            setErrorFor('owner', errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoadingFor('owner', false);
        }
    }, [fetchOwnerBoxes, setLoadingFor, setErrorFor]);

    const updateBox = useCallback(async (boxId, boxData) => {
        setLoadingFor('owner', true);
        setErrorFor('owner', null);
        const formData = new FormData();
        // Always send 'sport' as first selected sport for backend compatibility
        if (boxData.sports && boxData.sports.length > 0) {
            formData.append('sport', boxData.sports[0]);
        }
        Object.keys(boxData).forEach(key => {
            if (key === 'images' || key === 'sport') return;
            let value = boxData[key];
            // For amenities, sports, rules: always send as JSON string
            if (["amenities", "sports", "rules"].includes(key)) {
                formData.append(key, JSON.stringify(value));
            } else if (value !== null && value !== undefined) {
                formData.append(key, value);
            }
        });
        // Add new images if any
        if (boxData.images && boxData.images.length > 0) {
            boxData.images.forEach((file, idx) => {
                formData.append('images', file);
                if (idx === 0) formData.append('image', file);
            });
        }
        try {
            await api.put(`/boxes/owner/${boxId}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await fetchOwnerBoxes();
            return { success: true };
        } catch (err) {
            console.error('Error updating box:', err.response?.data);
            const errorMessage = err.response?.data?.detail || Object.values(err.response?.data || {})[0]?.[0] || 'Failed to update the box.';
            setErrorFor('owner', errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoadingFor('owner', false);
        }
    }, [fetchOwnerBoxes, setLoadingFor, setErrorFor]);

    const fetchPendingBoxes = useCallback(async () => {
        setLoadingFor('pending', true);
        setErrorFor('pending', null);
        try {
            const response = await api.get('/boxes/admin/pending/');
            setPendingBoxes(response.data.results || response.data || []);
        } catch (err) {
            console.error('Error fetching pending boxes:', err);
            setErrorFor('pending', 'Could not load pending boxes.');
        } finally {
            setLoadingFor('pending', false);
        }
    }, [setLoadingFor, setErrorFor]);

    const approveBox = useCallback(async (boxId) => {
        try {
            await api.post(`/boxes/admin/${boxId}/approve/`);
            await fetchPendingBoxes();
            return { success: true };
        } catch (err) {
            console.error('Error approving box:', err);
            const errorMessage = err.response?.data?.detail || 'Failed to approve box.';
            return { success: false, error: errorMessage };
        }
    }, [fetchPendingBoxes]);

    const rejectBox = useCallback(async (boxId, reason) => {
        try {
            await api.post(`/boxes/admin/${boxId}/reject/`, { reason });
            await fetchPendingBoxes();
            return { success: true };
        } catch (err) {
            console.error('Error rejecting box:', err);
            const errorMessage = err.response?.data?.detail || 'Failed to reject box.';
            return { success: false, error: errorMessage };
        }
    }, [fetchPendingBoxes]);

    const fetchNearbyBoxes = useCallback(async (latitude, longitude, radius = 10) => {
        if (!latitude || !longitude) {
            console.error('fetchNearbyBoxes: Missing latitude or longitude', { latitude, longitude });
            setErrorFor('nearby', 'Invalid location data for nearby search.');
            return;
        }

        setLoadingFor('nearby', true);
        setErrorFor('nearby', null);
        try {
            const response = await api.get('/boxes/public/nearby/', {
                params: { lat: latitude, lng: longitude, radius: radius || 10 }
            });
            setNearbyBoxes(processBoxData(response.data));
        } catch (err) {
            console.error('Error fetching nearby boxes:', err);
            setErrorFor('nearby', 'Could not load nearby boxes.');
        } finally {
            setLoadingFor('nearby', false);
        }
    }, [processBoxData, setLoadingFor, setErrorFor]);

    const fetchBoxes = useCallback(async () => {
        setLoadingFor('boxes', true);
        setErrorFor('boxes', null);
        try {
            // Single API call - no pagination needed since API returns all results
            const response = await api.get('/boxes/public/', { params: filters });
            const data = response.data;

            const boxesArray = data.results || data;
            if (!Array.isArray(boxesArray)) {
                console.error('BoxContext: Invalid response format - not an array:', boxesArray);
                setErrorFor('boxes', 'Invalid response format from server');
                return;
            }

            setBoxes(processBoxData(boxesArray));
        } catch (err) {
            console.error('BoxContext: Error fetching boxes:', err.response?.data || err.message);
            setErrorFor('boxes', 'Could not load boxes. Please try again.');
        } finally {
            setLoadingFor('boxes', false);
        }
    }, [filters, processBoxData, setLoadingFor, setErrorFor]);

    const fetchFeaturedBoxes = useCallback(async () => {
        setLoadingFor('featured', true);
        setErrorFor('featured', null);
        try {
            const response = await api.get('/boxes/public/featured/');
            setFeaturedBoxes(processBoxData(response.data));
        } catch (err) {
            console.error('Error fetching featured boxes:', err);
            setErrorFor('featured', 'Could not load featured boxes.');
        } finally {
            setLoadingFor('featured', false);
        }
    }, [processBoxData, setLoadingFor, setErrorFor]);

    const fetchPopularBoxes = useCallback(async () => {
        setLoadingFor('popular', true);
        setErrorFor('popular', null);
        try {
            const response = await api.get('/boxes/public/popular/');
            setPopularBoxes(processBoxData(response.data));
        } catch (err) {
            console.error('Error fetching popular boxes:', err);
            setErrorFor('popular', 'Could not load popular boxes.');
        } finally {
            setLoadingFor('popular', false);
        }
    }, [processBoxData, setLoadingFor, setErrorFor]);

    // Fetch boxes when filters change
    useEffect(() => {
        fetchBoxes();
    }, [fetchBoxes]);

    const contextValue = useMemo(() => ({
        boxes,
        featuredBoxes,
        popularBoxes,
        nearbyBoxes,
        ownerBoxes,
        pendingBoxes,
        loading,
        error,
        fetchBoxes,
        fetchFeaturedBoxes,
        fetchPopularBoxes,
        fetchNearbyBoxes,
        fetchOwnerBoxes,
        fetchPendingBoxes,
        addBox,
        updateBox,
        approveBox,
        rejectBox,
        filters,
        setFilters,
        loadingMap,
        errorMap,
        clearFiltersAndRefresh: () => {
            // Resetting filters triggers the filters-changed effect above,
            // which calls fetchBoxes() and manages its own loading/error state.
            setFilters({});
        },
        refreshAll: () => {
            fetchBoxes();
            fetchFeaturedBoxes();
            fetchPopularBoxes();
            fetchOwnerBoxes();
        }
    }), [boxes, featuredBoxes, popularBoxes, nearbyBoxes, ownerBoxes, pendingBoxes, loading, error, loadingMap, errorMap, fetchBoxes, fetchFeaturedBoxes, fetchPopularBoxes, fetchNearbyBoxes, fetchOwnerBoxes, fetchPendingBoxes, addBox, updateBox, approveBox, rejectBox, filters]);

    return (
        <BoxContext.Provider value={contextValue}>
            {children}
        </BoxContext.Provider>
    );
};