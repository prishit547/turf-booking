import { useState, useEffect } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarPlus, CalendarClock, Share2, UserPlus, Link2, XCircle, Phone, Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, Button, Loader, StatusPill, DateStrip, SlotGrid } from '../components/ui';
import { useBooking } from '../context/BookingContext';
import { api, useAuth } from '../api.jsx';
import { formatLocalDate } from '../utils/date';
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
    const { fetchBookingById, cancelBooking, rescheduleBooking } = useBooking();

    const justBooked = Boolean(location.state?.booking);
    const [booking, setBooking] = useState(location.state?.booking || null);
    const [loading, setLoading] = useState(!justBooked);
    const [notFound, setNotFound] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [ownerCancelReason, setOwnerCancelReason] = useState('');

    // Reschedule: a small inline date/time picker reusing the same
    // DateStrip/SlotGrid components BoxDetails.jsx uses for a fresh
    // booking — duration and box stay fixed here, so only date/time move.
    const [reschedOpen, setReschedOpen] = useState(false);
    const [reschedDate, setReschedDate] = useState(new Date());
    const [reschedTime, setReschedTime] = useState('');
    const [reschedBookedSlots, setReschedBookedSlots] = useState([]);
    const [reschedSlotsLoading, setReschedSlotsLoading] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);

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

    // Fetch booked slots for whichever date is selected in the reschedule
    // picker — same public endpoint BoxDetails.jsx uses for a fresh booking.
    useEffect(() => {
        if (!reschedOpen || !booking?.box?.id) return;
        let cancelled = false;
        setReschedSlotsLoading(true);
        api.get(`/bookings/booked_slots/?box_id=${booking.box.id}&date=${formatLocalDate(reschedDate)}`)
            .then((res) => { if (!cancelled) setReschedBookedSlots(res.data.booked_slots || []); })
            .catch(() => { if (!cancelled) setReschedBookedSlots([]); })
            .finally(() => { if (!cancelled) setReschedSlotsLoading(false); });
        return () => { cancelled = true; };
    }, [reschedOpen, reschedDate, booking?.box?.id]);

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
    // location.state's pre-formatted values are only trustworthy for the
    // slot Checkout.jsx actually booked — once a reschedule moves the
    // booking, they'd silently show the old date/time forever (the router
    // state never changes), so prefer them only until the first reschedule.
    const dateDisplay = (!booking.rescheduled_at && location.state?.dateDisplay) || new Date(booking.date).toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
    const timeSlot = (!booking.rescheduled_at && location.state?.timeSlot) || `${booking.start_time} - ${booking.end_time}`;
    const total = location.state?.total ?? booking.total_amount;
    const isOwnBooking = user?.id && String(booking.user_id ?? booking.user?.id) === String(user.id);
    const canManage = isOwnBooking && booking.booking_status === 'Confirmed';
    // A box owner reaching this booking's detail via their own Bookings
    // tab row (see OwnerDashboard.jsx) gets the same cancel power as the
    // customer, scoped to their own box — but only a cancel action, none
    // of the customer-only affordances (invite squad, share, etc.).
    const isBoxOwner = user?.role === 'owner' && String(booking.box_owner_id) === String(user.id);
    const canOwnerCancel = isBoxOwner && !isOwnBooking && booking.booking_status === 'Confirmed';
    // Same permission shape as cancel (customer's own booking, or the box
    // owner on a booking for their own box), plus a booking only ever gets
    // one reschedule — once used, rescheduled_at is set and this hides.
    const canReschedule = (canManage || canOwnerCancel) && !booking.rescheduled_at;

    // Venue contact (customer's own booking) / customer contact (box owner
    // viewing a booking on their box) — see BookingSerializer's
    // box_owner_phone/box_owner_email and OwnerBookingSerializer's
    // customer_phone_display equivalents for the backend side of this.
    const showVenueContact = isOwnBooking && (booking.box_owner_phone || booking.box_owner_email);
    const showCustomerContact = isBoxOwner && !isOwnBooking;
    const customerPhone = booking.customer_phone_display || booking.customer_phone || '';

    // Reschedule picker: same slot-availability rules BoxDetails.jsx uses
    // for a fresh booking, but against the booking's own fixed duration and
    // box (box/duration never change on a reschedule).
    const reschedOpeningHour = parseInt((booking.box?.opening_time || '06:00').split(':')[0]);
    const reschedClosingHour = parseInt((booking.box?.closing_time || '23:00').split(':')[0]);
    const reschedTimeSlots = [];
    for (let h = reschedOpeningHour; h < reschedClosingHour; h++) {
        reschedTimeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    const reschedDateString = formatLocalDate(reschedDate);
    const isReschedDateBlocked = booking.box?.blocked_dates?.includes(reschedDateString);
    const isReschedSlotBooked = (t) => reschedBookedSlots.includes(t);
    const isReschedSlotAvailable = (t) => {
        if (isReschedDateBlocked) return false;
        const hour = parseInt(t.split(':')[0]);
        if (hour + booking.duration > reschedClosingHour) return false;
        for (let i = 0; i < booking.duration; i++) {
            const checkTime = `${(hour + i).toString().padStart(2, '0')}:00`;
            if (reschedBookedSlots.includes(checkTime)) return false;
        }
        return true;
    };
    const isReschedSameSlot = reschedTime && reschedDateString === booking.date && reschedTime === booking.start_time;

    const openReschedulePicker = () => {
        setReschedDate(new Date(`${booking.date}T00:00:00`));
        setReschedTime('');
        setReschedOpen(true);
    };

    const handleConfirmReschedule = async () => {
        if (!reschedTime || isReschedSameSlot) return;
        setRescheduling(true);
        const { success, error } = await rescheduleBooking(booking.id, { date: reschedDateString, startTime: reschedTime });
        setRescheduling(false);
        if (success) {
            toast.success('Booking rescheduled.');
            setReschedOpen(false);
            setReschedTime('');
            const fresh = await fetchBookingById(booking.id);
            if (fresh.success) setBooking(fresh.data);
        } else {
            toast.error(error || 'Failed to reschedule booking.');
        }
    };

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
        const reason = canOwnerCancel ? (ownerCancelReason.trim() || undefined) : undefined;
        const { success, error } = await cancelBooking(booking.id, reason);
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

                        {showVenueContact && (
                            <div className="mt-5 rounded-xl border border-border p-4 text-left">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Venue contact</p>
                                <div className="mt-2 space-y-1.5">
                                    {booking.box_owner_phone && (
                                        <a href={`tel:${booking.box_owner_phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                                            <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {booking.box_owner_phone}
                                        </a>
                                    )}
                                    {booking.box_owner_email && (
                                        <a href={`mailto:${booking.box_owner_email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                                            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {booking.box_owner_email}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {showCustomerContact && (
                            <div className="mt-5 rounded-xl border border-border p-4 text-left">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Customer contact</p>
                                <p className="mt-1.5 text-sm font-medium text-foreground">
                                    {booking.customer_name || booking.user}
                                </p>
                                <div className="mt-1 space-y-1.5">
                                    {customerPhone && (
                                        <a href={`tel:${customerPhone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                                            <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {customerPhone}
                                        </a>
                                    )}
                                    {booking.user_email && (
                                        <a href={`mailto:${booking.user_email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary">
                                            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {booking.user_email}
                                        </a>
                                    )}
                                    {!customerPhone && !booking.user_email && (
                                        <p className="text-sm text-muted-foreground">No contact info on file.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {canReschedule && (
                            <div className="mt-5">
                                {!reschedOpen ? (
                                    <button
                                        type="button"
                                        onClick={openReschedulePicker}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50"
                                    >
                                        <CalendarClock className="h-4 w-4" /> Reschedule booking
                                    </button>
                                ) : (
                                    <div className="space-y-3 rounded-xl bg-elevated p-4 text-left">
                                        <p className="text-sm font-semibold text-foreground">Pick a new date &amp; time</p>
                                        <DateStrip
                                            selectedDate={reschedDate}
                                            onSelectDate={(d) => { setReschedDate(d); setReschedTime(''); }}
                                        />
                                        <SlotGrid
                                            timeSlots={reschedTimeSlots}
                                            selectedTimeSlot={reschedTime}
                                            onSelect={setReschedTime}
                                            isTimeSlotBooked={isReschedSlotBooked}
                                            isTimeSlotAvailable={isReschedSlotAvailable}
                                            loading={reschedSlotsLoading}
                                            duration={booking.duration}
                                        />
                                        {isReschedSameSlot && (
                                            <p className="text-xs text-warning">That&rsquo;s the current slot — pick a different one.</p>
                                        )}
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" fullWidth onClick={() => setReschedOpen(false)}>
                                                Back
                                            </Button>
                                            <Button
                                                size="sm"
                                                fullWidth
                                                onClick={handleConfirmReschedule}
                                                loading={rescheduling}
                                                disabled={!reschedTime || isReschedSameSlot}
                                            >
                                                Confirm new slot
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!canOwnerCancel && (
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
                        )}

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

                        {/* Box owner viewing a booking on their own box: only a cancel
                            action, scoped to their side of this (they didn't make the
                            booking, so invite/share/add-to-calendar don't apply to them). */}
                        {canOwnerCancel && (
                            <div className="mt-5 space-y-2 text-left">
                                <label className="block text-xs font-medium text-muted-foreground">
                                    Reason for cancellation (optional)
                                </label>
                                <textarea
                                    value={ownerCancelReason}
                                    onChange={(e) => setOwnerCancelReason(e.target.value)}
                                    rows={2}
                                    placeholder="Let the customer know why you're cancelling..."
                                    className="w-full px-3 py-2 rounded-lg bg-elevated text-foreground border border-input outline-none placeholder-muted-foreground resize-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={cancelling}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-danger text-danger py-2.5 text-xs font-bold uppercase tracking-wide transition hover:bg-danger/10 disabled:opacity-50"
                                >
                                    <XCircle className="h-4 w-4" /> {cancelling ? 'Cancelling…' : 'Cancel this booking'}
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
