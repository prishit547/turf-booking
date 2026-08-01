import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../api.jsx';

// Mirrors API_BASE_URL exactly (this app talks to the backend via an
// absolute URL, not Vite's dev proxy — see frontend/.env's VITE_API_BASE_URL)
// but swapped to a ws(s):// scheme and with the /api suffix dropped, since
// the Channels route lives at /ws/bookings/slot/... on the same host.
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '');

const IDLE_STATE = { status: 'idle', position: null, expiresAt: null };

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
            `${WS_BASE_URL}/ws/bookings/slot/${boxId}/${date}/${startTime}/${duration}/?${params.toString()}`
        );
        socketRef.current = socket;

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'held':
                case 'promoted':
                    setState({ status: 'held', position: null, expiresAt: message.expires_at });
                    break;
                case 'queued':
                    setState({ status: 'queued', position: message.position, expiresAt: null });
                    break;
                case 'slot_booked':
                    setState({ status: 'lost', position: null, expiresAt: null });
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
    }, [enabled, boxId, date, startTime, duration, holdToken, accessToken]);

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

    return { status: state.status, position: state.position, expiresAt: state.expiresAt, secondsRemaining };
}
