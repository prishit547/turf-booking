// BookingContext.jsx
import { createContext, useContext, useReducer, useCallback } from 'react'; // Import useCallback
import { api } from '../api.jsx'; // Assuming you have an Axios instance exported as 'api'

const BookingContext = createContext();

const bookingReducer = (state, action) => {
    switch (action.type) {
        case 'SET_BOOKINGS': {
            // Ensure payload.bookings is always an array
            const newBookings = Array.isArray(action.payload.bookings) ? action.payload.bookings : [];
            return { ...state, bookings: newBookings, count: action.payload.count, error: null };
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

export const BOOKINGS_PAGE_SIZE = 20;

const initialState = {
    bookings: [], // Correctly initialized as an empty array
    count: 0, // Total bookings across all pages, for the Pagination control
    loading: false,
    error: null
};

export const BookingProvider = ({ children }) => {
    const [state, dispatch] = useReducer(bookingReducer, initialState);

    // Memoize fetchBookings. `page` defaults to 1 so every existing call
    // site (which only ever wanted "my bookings") keeps working unchanged.
    const fetchBookings = useCallback(async (userId, page = 1) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            const response = await api.get(`/bookings?userId=${userId}&page=${page}&page_size=${BOOKINGS_PAGE_SIZE}`);

            let bookingsData = [];
            let count = null;
            // Common patterns for nested array responses from APIs
            if (response.data && Array.isArray(response.data.results)) { // For Django REST Framework pagination
                bookingsData = response.data.results;
                count = response.data.count;
            } else if (response.data && Array.isArray(response.data.data)) { // Another common pattern
                bookingsData = response.data.data;
            } else if (Array.isArray(response.data)) { // If the API returns the array directly
                bookingsData = response.data;
            } else {
                console.warn("Unexpected API response structure for bookings. Expected an array or an object containing an array. Received:", response.data);
                // If it's not an array, default to an empty array to prevent filter errors
                bookingsData = [];
            }
            // A non-paginated response shape (e.g. an unmocked test double)
            // still needs a count for the Pagination control to size itself.
            if (count === null) count = bookingsData.length;

            dispatch({ type: 'SET_BOOKINGS', payload: { bookings: bookingsData, count } });

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

    // Memoize cancelBooking. `reason` is optional — omitted entirely from
    // the POST body when not provided, so existing customer-cancel call
    // sites that call this with just one arg are unaffected. Currently
    // used by the box-owner cancel path on BookingConfirmation.jsx.
    const cancelBooking = useCallback(async (bookingId, reason) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
            // Cancellation has real business logic (2-hour cutoff, status
            // transition) that lives behind the `cancel` action — a raw
            // DELETE would hit the admin-only destroy endpoint instead.
            const response = await api.post(`/bookings/${bookingId}/cancel/`, reason ? { reason } : undefined);
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

    // Reschedules a Confirmed booking to a new date/start_time — box and
    // duration stay fixed server-side (see bookings/services.py's
    // reschedule_booking), so only those two fields are ever sent. Used by
    // both the customer's own booking and a box owner rescheduling a
    // booking on their box (BookingConfirmation.jsx gates which via
    // canReschedule).
    const rescheduleBooking = useCallback(async (bookingId, { date, startTime }) => {
        try {
            const response = await api.post(`/bookings/${bookingId}/reschedule/`, { date, start_time: startTime });
            dispatch({ type: 'UPDATE_BOOKING', payload: response.data });
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to reschedule booking.';
            return { success: false, error: errorMessage };
        }
    }, [dispatch]);

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

    // Second phase: finalize a held slot into a real booking. couponCode,
    // redeemCode, and useWallet are all optional — the backend
    // re-validates/recomputes all of them from scratch (never trusts a
    // discount or wallet deduction computed client-side). couponCode and
    // redeemCode are mutually exclusive (see BookingWriteError in
    // bookings/services.py::create_booking_row) — the caller picks one
    // based on `kind` from the /bookings/coupons/validate/ response.
    const confirmReservation = useCallback(async (holdToken, { couponCode, redeemCode, useWallet } = {}) => {
        try {
            const response = await api.post(`/bookings/confirm/${holdToken}/`, {
                ...(couponCode ? { couponCode } : {}),
                ...(redeemCode ? { redeemCode } : {}),
                ...(useWallet ? { useWallet: true } : {}),
            });
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

    // Books the same slot weekly for `weeks` occurrences in one request,
    // bypassing the reserve/hold flow entirely (see backend docstring on
    // BookingViewSet.recurring). Always resolves successfully (never
    // throws) — the caller inspects `created`/`failed` to report which
    // weeks landed, since partial success is the expected outcome.
    const createRecurringBooking = useCallback(async ({ boxId, date, startTime, duration, weeks }) => {
        try {
            const response = await api.post('/bookings/recurring/', { boxId, date, startTime, duration, weeks });
            response.data.created?.forEach((booking) => dispatch({ type: 'ADD_BOOKING', payload: booking }));
            return { success: true, ...response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to create recurring booking.';
            return { success: false, error: errorMessage };
        }
    }, [dispatch]);

    // Fetches the caller's own waitlist entries (id + slot signature),
    // optionally narrowed to one box — cheap enough to refetch on every
    // date change (see BoxDetails.jsx). Returns [] on failure rather than
    // throwing, since this backs a passive "which slots show ✓" display.
    const fetchMyWaitlist = useCallback(async (boxId) => {
        try {
            const response = await api.get('/bookings/waitlist/mine/', { params: boxId ? { box: boxId } : {} });
            return response.data;
        } catch (error) {
            console.error('Error fetching waitlist:', error.response?.data || error.message);
            return [];
        }
    }, []);

    const joinWaitlist = useCallback(async ({ boxId, date, startTime, duration }) => {
        try {
            const response = await api.post('/bookings/waitlist/', { boxId, date, startTime, duration });
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to join waitlist.';
            return { success: false, error: errorMessage };
        }
    }, []);

    const leaveWaitlist = useCallback(async (entryId) => {
        try {
            await api.delete(`/bookings/waitlist/${entryId}/`);
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to leave waitlist.';
            return { success: false, error: errorMessage };
        }
    }, []);

    // Group/split bookings: invite someone to a booking the caller made.
    // `invitedUserId` (an existing account, from searchUsers) or
    // `invitedEmail` (works even without an account — claimed on signup).
    const inviteToBooking = useCallback(async (bookingId, { invitedUserId, invitedEmail }) => {
        try {
            const response = await api.post(`/bookings/${bookingId}/invite/`, {
                invited_user_id: invitedUserId,
                invited_email: invitedEmail,
            });
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to send invite.';
            return { success: false, error: errorMessage };
        }
    }, []);

    // action is 'accept' or 'decline' — both are token-authorized (see
    // bookings/views.py's accept_invite/decline_invite docstrings).
    const respondToInvite = useCallback(async (token, action) => {
        try {
            const response = await api.post(`/bookings/invites/${token}/${action}/`);
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || `Failed to ${action} invite.`;
            return { success: false, error: errorMessage };
        }
    }, []);

    // Public — no auth required (see invite_detail's permission_classes),
    // so InviteClaim.jsx can show "X invited you to Y" before login.
    const getInviteDetail = useCallback(async (token) => {
        try {
            const response = await api.get(`/bookings/invites/${token}/`);
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'This invite could not be found.';
            return { success: false, error: errorMessage };
        }
    }, []);

    // Fetches a single booking by id — used for direct/refreshed visits to
    // /booking/:id (BookingConfirmation.jsx) that don't have router state
    // from the checkout flow. BookingViewSet.retrieve() already scopes to
    // the caller's own bookings or accepted-invite participation (404s
    // otherwise, no data leak).
    const fetchBookingById = useCallback(async (id) => {
        try {
            const response = await api.get(`/bookings/${id}/`);
            return { success: true, data: response.data };
        } catch (error) {
            const errorMessage = error.response?.data?.detail || error.message || 'Booking not found.';
            return { success: false, error: errorMessage };
        }
    }, []);

    const searchUsers = useCallback(async (query) => {
        try {
            const response = await api.get('/user/search/', { params: { q: query } });
            return response.data;
        } catch (error) {
            console.error('Error searching users:', error.response?.data || error.message);
            return [];
        }
    }, []);

    const value = {
        ...state,
        fetchBookings,
        createBooking,
        updateBooking,
        cancelBooking,
        rescheduleBooking,
        reserveSlot,
        createRecurringBooking,
        confirmReservation,
        releaseHold,
        fetchMyWaitlist,
        joinWaitlist,
        leaveWaitlist,
        inviteToBooking,
        respondToInvite,
        getInviteDetail,
        fetchBookingById,
        searchUsers,
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