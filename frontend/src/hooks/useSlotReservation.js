import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api.jsx';

function getWsBaseUrl() {
    if (API_BASE_URL && (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://'))) {
        return API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
    }
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    }
    return 'ws://localhost:8000';
}

const IDLE_STATE = { status: 'idle', position: null, expiresAt: null, message: null };

/**
 * Tracks live hold/queue status for one exact slot signature over the
 * reservation WebSocket. The server only pushes state-transition events
 * (held/queued/promoted/slot_booked/slot_released) carrying an expires_at
 * timestamp, not a tick every second — the countdown below is derived
 * client-side from that timestamp, matching this codebase's existing
 * hand-rolled setInterval/Date.now() style (see src/test/hooks.test.jsx).
 */
export function useSlotReservation({
    boxId, date, startTime, duration, holdToken, accessToken, enabled,
    // Seeds the hook's first render from a result the caller already has
    // (e.g. the HTTP reserve() response) so the UI doesn't flash "idle"
    // for the brief moment before the socket's own resync push arrives.
    initialStatus, initialPosition, initialExpiresAt,
    // Needed to tell "I was promoted" apart from "someone else was" — see
    // the 'promoted' case below, this isn't optional decoration.
    currentUserId,
}) {
    const [state, setState] = useState(() =>
        initialStatus
            ? { status: initialStatus, position: initialPosition ?? null, expiresAt: initialExpiresAt ?? null }
            : IDLE_STATE
    );
    const [secondsRemaining, setSecondsRemaining] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        if (!enabled || !boxId || !date || !startTime || !duration || !accessToken) {
            setState(IDLE_STATE);
            return undefined;
        }

        const params = new URLSearchParams({ token: accessToken });
        if (holdToken) params.set('hold_token', holdToken);
        const socket = new WebSocket(
            `${getWsBaseUrl()}/ws/bookings/slot/${boxId}/${date}/${startTime}/${duration}/?${params.toString()}`
        );
        socketRef.current = socket;

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'held':
                    // Only ever sent as part of this connection's own resync
                    // (see bookings/consumers.py's _send_resync) — never
                    // broadcast to other clients, so no identity check needed.
                    setState({ status: 'held', position: null, expiresAt: message.expires_at });
                    break;
                case 'promoted':
                    // 'promoted' is broadcast to everyone watching this slot
                    // (see bookings/broadcasting.py), not just the person who
                    // got promoted — every other still-queued client would
                    // receive this same event. Without this check, all of
                    // them would show "you have the slot!" simultaneously.
                    // new_holder_user_id arrives as a string (Redis-backed),
                    // so compare as strings regardless of currentUserId's type.
                    if (String(message.new_holder_user_id) === String(currentUserId)) {
                        setState({ status: 'held', position: null, expiresAt: message.expires_at });
                    } else {
                        // Someone ahead of us in the queue just left it —
                        // we're one position closer, still queued.
                        setState((prev) =>
                            prev.status === 'queued' && prev.position != null
                                ? { ...prev, position: Math.max(1, prev.position - 1) }
                                : prev
                        );
                    }
                    break;
                case 'queued':
                    setState({ status: 'queued', position: message.position, expiresAt: null });
                    break;
                case 'slot_booked':
                    // Like 'promoted', this is broadcast to the whole group —
                    // including the confirming user's own still-open socket
                    // (they've been connected since placing the hold). Their
                    // own REST confirm() response already drives their
                    // success UI, so echoing 'lost' back at them here would
                    // fire a false "someone else booked this" error right
                    // alongside their own success toast. Only actual other
                    // watchers should see this as a loss.
                    if (String(message.booked_by_user_id) === String(currentUserId)) {
                        setState(IDLE_STATE);
                    } else {
                        setState({ status: 'lost', position: null, expiresAt: null, message: null });
                    }
                    break;
                case 'owner_reserved':
                    // The box owner claimed this exact slot directly (see
                    // OwnerBookingViewSet.book), preempting whoever was
                    // holding or queued for it — everyone in the group gets
                    // this, there's no "was it me" check like slot_booked
                    // since the owner never goes through this hook/socket.
                    setState({ status: 'owner_reserved', position: null, expiresAt: null, message: message.message });
                    break;
                case 'slot_released':
                case 'idle':
                default:
                    setState(IDLE_STATE);
                    break;
            }
        };

        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, [enabled, boxId, date, startTime, duration, holdToken, accessToken, currentUserId]);

    useEffect(() => {
        if (state.status !== 'held' || !state.expiresAt) {
            setSecondsRemaining(null);
            return undefined;
        }
        const tick = () => setSecondsRemaining(Math.max(0, Math.round(state.expiresAt - Date.now() / 1000)));
        tick();
        const intervalId = setInterval(tick, 1000);
        return () => clearInterval(intervalId);
    }, [state.status, state.expiresAt]);

    return { status: state.status, position: state.position, expiresAt: state.expiresAt, secondsRemaining, message: state.message };
}
