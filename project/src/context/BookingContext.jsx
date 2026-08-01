// BookingContext.jsx
import { createContext, useContext, useReducer, useCallback } from 'react'; // Import useCallback
import { api } from '../api.jsx'; // Assuming you have an Axios instance exported as 'api'

const BookingContext = createContext();

const bookingReducer = (state, action) => {
    switch (action.type) {
        case 'SET_BOOKINGS': {
            // Ensure payload is always an array
            const newBookings = Array.isArray(action.payload) ? action.payload : [];
            return { ...state, bookings: newBookings, error: null };
        }
        case 'ADD_BOOKING':
            // Ensure state.bookings is an array before spreading
            return { ...state, bookings: Array.isArray(state.bookings) ? [...state.bookings, action.payload] : [action.payload], error: null };
        case 'UPDATE_BOOKING':
            // Ensure state.bookings is an array before mapping
            return {
                ...state,
                bookings: Array.isArray(state.bookings) ? state.bookings.map(booking =>
                    booking.id === action.payload.id ? action.payload : booking
                ) : [],
                error: null
            };
        case 'DELETE_BOOKING':
            // Ensure state.bookings is an array before filtering
            return {
                ...state,
                bookings: Array.isArray(state.bookings) ? state.bookings.filter(booking => booking.id !== action.payload) : [],
                error: null
            };
        case 'SET_LOADING':
            return { ...state, loading: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload, loading: false };
        default:
            return state;
    }
};

const initialState = {
    bookings: [], // Correctly initialized as an empty array
    loading: false,
    error: null
};

export const BookingProvider = ({ children }) => {
    const [state, dispatch] = useReducer(bookingReducer, initialState);

    // Memoize fetchBookings
    const fetchBookings = useCallback(async (userId) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            const response = await api.get(`/bookings?userId=${userId}`);

            let bookingsData = [];
            // Common patterns for nested array responses from APIs
            if (response.data && Array.isArray(response.data.results)) { // For Django REST Framework pagination
                bookingsData = response.data.results;
            } else if (response.data && Array.isArray(response.data.data)) { // Another common pattern
                bookingsData = response.data.data;
            } else if (Array.isArray(response.data)) { // If the API returns the array directly
                bookingsData = response.data;
            } else {
                console.warn("Unexpected API response structure for bookings. Expected an array or an object containing an array. Received:", response.data);
                // If it's not an array, default to an empty array to prevent filter errors
                bookingsData = [];
            }
            
            dispatch({ type: 'SET_BOOKINGS', payload: bookingsData });

        } catch (error) {
            console.error('Error fetching bookings:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch bookings.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [dispatch]); // Dependency: dispatch is stable

    // Memoize createBooking
    const createBooking = useCallback(async (bookingData) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            const response = await api.post('/bookings/', bookingData);
            dispatch({ type: 'ADD_BOOKING', payload: response.data });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('Error creating booking:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Failed to create booking.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            return { success: false, error: errorMessage };
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [dispatch]); // Dependency: dispatch is stable

    // Memoize updateBooking
    const updateBooking = useCallback(async (bookingId, updatedData) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            const response = await api.patch(`/bookings/${bookingId}`, updatedData);
            dispatch({ type: 'UPDATE_BOOKING', payload: response.data });
            return { success: true, data: response.data };
        } catch (error) {
            console.error('Error updating booking:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to update booking.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            return { success: false, error: errorMessage };
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [dispatch]); // Dependency: dispatch is stable

    // Memoize cancelBooking
    const cancelBooking = useCallback(async (bookingId) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            // Cancellation has real business logic (2-hour cutoff, status
            // transition) that lives behind the `cancel` action — a raw
            // DELETE would hit the admin-only destroy endpoint instead.
            const response = await api.post(`/bookings/${bookingId}/cancel/`);
            dispatch({ type: 'UPDATE_BOOKING', payload: response.data });
            return { success: true };
        } catch (error) {
            console.error('Error canceling booking:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Failed to cancel booking.';
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            return { success: false, error: errorMessage };
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [dispatch]); // Dependency: dispatch is stable

    // reserveSlot/confirmReservation/releaseHold deliberately don't dispatch
    // SET_LOADING/SET_ERROR into the shared context state — they're used in
    // a much more granular, frequent flow (one call per slot click) than
    // fetchBookings/createBooking, and sharing one loading/error flag across
    // all of them would reproduce the same race BoxContext's loadingMap
    // fix addressed for its own fetches. The calling component manages its
    // own local loading/error UI state instead (see BoxDetails.jsx).

    // First phase of the two-phase reservation flow: claim a contended slot
    // or join its wait queue. Returns {status: 'held'|'queued', hold_token, ...}
    // on success, or {success: false, unavailable: true, error} if the slot
    // is already permanently booked (409).
    const reserveSlot = useCallback(async ({ boxId, date, startTime, duration }) => {
        try {
            const response = await api.post('/bookings/reserve/', { boxId, date, startTime, duration });
            return { success: true, ...response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to reserve this slot.';
            return { success: false, unavailable: error.response?.status === 409, error: errorMessage };
        }
    }, []);

    // Second phase: finalize a held slot into a real booking.
    const confirmReservation = useCallback(async (holdToken) => {
        try {
            const response = await api.post(`/bookings/confirm/${holdToken}/`);
            dispatch({ type: 'ADD_BOOKING', payload: response.data });
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to confirm booking.';
            return { success: false, error: errorMessage };
        }
    }, [dispatch]);

    // Explicit "give up my hold/spot in queue" — promotes the next queued
    // user immediately instead of making them wait out the full TTL.
    const releaseHold = useCallback(async (holdToken) => {
        try {
            const response = await api.post(`/bookings/release_hold/${holdToken}/`);
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to release hold.';
            return { success: false, error: errorMessage };
        }
    }, []);

    const value = {
        ...state,
        fetchBookings,
        createBooking,
        updateBooking,
        cancelBooking,
        reserveSlot,
        confirmReservation,
        releaseHold
    };

    return (
        <BookingContext.Provider value={value}>
            {children}
        </BookingContext.Provider>
    );
};

export const useBooking = () => {
    const context = useContext(BookingContext);
    if (!context) {
        throw new Error('useBooking must be used within a BookingProvider');
    }
    return context;
};