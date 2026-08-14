import { useState, useEffect } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarPlus, Share2, UserPlus, Link2, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, Button, Loader, StatusPill } from '../components/ui';
import { useBooking } from '../context/BookingContext';
import { useAuth } from '../api.jsx';
import InviteBookingModal from '../components/bookings/InviteBookingModal';

const PARTICLE_COUNT = 12;

function SuccessBurst() {
    return (
        <div className="relative w-24 h-24 mx-auto">
            <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="absolute inset-0 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center"
            >
                <motion.svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <motion.path
                        d="M4 12.5L9.5 18L20 6"
                        stroke="#D1FB00"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
                    />
                </motion.svg>
            </motion.div>
            {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
                const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
                return (
                    <motion.span
                        key={i}
                        className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                        initial={{ opacity: 1, x: 0, y: 0 }}
                        animate={{
                            opacity: 0,
                            x: Math.cos(angle) * 70,
                            y: Math.sin(angle) * 70,
                        }}
                        transition={{ delay: 0.35, duration: 0.7, ease: 'easeOut' }}
                    />
                );
            })}
        </div>
    );
}

// Deterministic pseudo-random pass grid seeded from the real booking ID —
// a decorative "show at the gate" pass graphic, not a scannable code, same
// spirit as the reference design's QrPass.
function BookingPass({ seed }) {
    const cells = Array.from({ length: 144 }, (_, i) => {
        let h = i + 7;
        for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 997;
        return h % 3 !== 0;
    });
    return (
        <div className="grid grid-cols-12 gap-0.5 rounded-lg bg-foreground p-3" aria-hidden>
            {cells.map((on, i) => (
                <span key={i} className={`h-2.5 w-2.5 ${on ? 'bg-background' : 'bg-foreground'}`} />
            ))}
        </div>
    );
}

// Minimal RFC 5545 escaping — commas/semicolons/newlines are the only
// characters that actually need it for the plain text fields we emit.
function escapeICS(text) {
    return String(text).replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
}

function icsDateTime(dateStr, timeStr) {
    return `${dateStr.replace(/-/g, '')}T${timeStr.replace(':', '')}00`;
}

// Builds a real .ics file client-side (no calendar library in this repo,
// and none is needed — VCALENDAR is plain text) as a floating local time,
// so it opens correctly in whatever calendar app regardless of timezone.
function buildICS(booking, boxName, boxLocation) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//BookMyBox//Booking//EN',
        'BEGIN:VEVENT',
        `UID:booking-${booking.id}@bookmybox.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDateTime(booking.date, booking.start_time)}`,
        `DTEND:${icsDateTime(booking.date, booking.end_time)}`,
        `SUMMARY:${escapeICS(`${boxName} — BookMyBox`)}`,
        boxLocation ? `LOCATION:${escapeICS(boxLocation)}` : null,
        `DESCRIPTION:${escapeICS(`Booking #${booking.id} via BookMyBox.`)}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean);
    return lines.join('\r\n');
}

function downloadICS(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Doubles as both the celebratory just-booked screen (reached from
 * Checkout.jsx with `location.state.booking` already in hand) and a plain
 * "Booking Details" page for any later visit — from the Bookings tab's
 * history/upcoming rows, a bookmark, a refresh, or a link someone shared.
 * BookingViewSet.retrieve() already scopes to the caller's own booking or
 * an accepted invite, so a direct fetch here can't leak someone else's
 * booking — it 404s instead.
 */
const BookingConfirmation = () => {
    const { bookingId } = useParams();
    const location = useLocation();
    const { user } = useAuth();
    const { fetchBookingById, cancelBooking } = useBooking();

    const justBooked = Boolean(location.state?.booking);
    const [booking, setBooking] = useState(location.state?.booking || null);
    const [loading, setLoading] = useState(!justBooked);
    const [notFound, setNotFound] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        if (justBooked) return;
        let cancelled = false;
        setLoading(true);
        fetchBookingById(bookingId).then((result) => {
            if (cancelled) return;
            if (result.success) {
                setBooking(result.data);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingId, justBooked]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader text="Loading booking..." />
            </div>
        );
    }

    if (notFound || !booking) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Booking #{bookingId}</h2>
                    <p className="text-muted-foreground mb-6">
                        We couldn&rsquo;t find this booking — it may belong to someone else, or the link is out of date.
                    </p>
                    <Button as={Link} to="/user-dashboard">Go to my bookings</Button>
                </Card>
            </div>
        );
    }

    const boxName = booking.box_name || booking.box?.name || location.state?.boxName || 'Your booking';
    const boxLocation = booking.box_location || booking.box?.location || '';
    const dateDisplay = location.state?.dateDisplay || new Date(booking.date).toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
    const timeSlot = location.state?.timeSlot || `${booking.start_time} - ${booking.end_time}`;
    const total = location.state?.total ?? booking.total_amount;
    const isOwnBooking = user?.id && String(booking.user_id ?? booking.user?.id) === String(user.id);
    const canManage = isOwnBooking && booking.booking_status === 'Confirmed';

    const handleAddToCalendar = () => {
        const ics = buildICS(booking, boxName, boxLocation);
        downloadICS(ics, `bookmybox-${booking.id}.ics`);
        toast.success('Calendar file downloaded — open it to add the event.');
    };

    const handleShareLink = async () => {
        const url = `${window.location.origin}/booking/${booking.id}`;
        const text = `My booking at ${boxName} — ${dateDisplay}, ${timeSlot}`;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'BookMyBox booking', text, url });
            } catch {
                // user cancelled the share sheet — not an error
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied to clipboard');
        } catch {
            toast.error('Could not copy the link.');
        }
    };

    const handleCancel = async () => {
        setCancelling(true);
        const { success, error } = await cancelBooking(booking.id);
        setCancelling(false);
        if (success) {
            toast.success('Booking cancelled.');
            const fresh = await fetchBookingById(booking.id);
            if (fresh.success) setBooking(fresh.data);
        } else {
            toast.error(error || 'Failed to cancel booking.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-14 relative overflow-hidden">
            <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative max-w-lg w-full text-center">
                {justBooked ? (
                    <>
                        <SuccessBurst />
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="mt-6"
                        >
                            <h1 className="font-display font-black uppercase tracking-tight text-3xl text-foreground">
                                You&rsquo;re on
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                Booking ID <span className="font-semibold text-primary">#{booking.id}</span>
                            </p>
                        </motion.div>
                    </>
                ) : (
                    <div>
                        <h1 className="font-display font-black uppercase tracking-tight text-2xl text-foreground">
                            Booking Details
                        </h1>
                        <div className="mt-2 flex items-center justify-center gap-2">
                            <span className="text-muted-foreground text-sm">#{booking.id}</span>
                            <StatusPill status={booking.booking_status} />
                        </div>
                    </div>
                )}

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: justBooked ? 0.6 : 0.1 }}>
                    <Card className="mt-6 text-left">
                        <h2 className="font-display text-xl uppercase">{boxName}</h2>
                        {boxLocation && <p className="mt-1 text-sm text-muted-foreground">{boxLocation}</p>}
                        <p className="mt-1 text-sm text-muted-foreground">{dateDisplay}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{timeSlot} · {booking.duration}h</p>
                        <div className="mt-5 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                                {booking.payment_status === 'Refunded' ? 'Refunded' : 'Total'}
                            </span>
                            <span className="font-display text-2xl text-foreground">₹{total}</span>
                        </div>

                        {booking.booking_status !== 'Cancelled' && (
                            <div className="mt-6 grid place-items-center rounded-xl bg-elevated p-5">
                                <BookingPass seed={booking.id} />
                                <p className="mt-3 text-xs text-muted-foreground">Show this pass at the gate</p>
                            </div>
                        )}

                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={handleAddToCalendar}
                                disabled={booking.booking_status === 'Cancelled'}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50 disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <CalendarPlus className="h-4 w-4" /> Add to calendar
                            </button>
                            {canManage ? (
                                <button
                                    type="button"
                                    onClick={() => setInviteOpen(true)}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50"
                                >
                                    <UserPlus className="h-4 w-4" /> Invite squad
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleShareLink}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50"
                                >
                                    <Share2 className="h-4 w-4" /> Share
                                </button>
                            )}
                        </div>

                        {canManage && (
                            <div className="mt-2 flex justify-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleShareLink}
                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <Link2 className="h-3.5 w-3.5" /> Copy link
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={cancelling}
                                    className="inline-flex items-center gap-1.5 text-xs text-danger hover:text-danger/80 transition-colors disabled:opacity-50"
                                >
                                    <XCircle className="h-3.5 w-3.5" /> {cancelling ? 'Cancelling…' : 'Cancel booking'}
                                </button>
                            </div>
                        )}
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: justBooked ? 0.7 : 0.2 }}
                    className="flex flex-wrap justify-center gap-3 mt-6"
                >
                    <Button as={Link} to="/user-dashboard" icon={<LayoutDashboard size={16} />}>
                        My bookings
                    </Button>
                    <Button as={Link} to="/boxes" variant="outline">
                        Book another
                    </Button>
                </motion.div>
            </div>

            {canManage && (
                <InviteBookingModal
                    booking={booking}
                    isOpen={inviteOpen}
                    onClose={() => setInviteOpen(false)}
                />
            )}
        </div>
    );
};

export default BookingConfirmation;
