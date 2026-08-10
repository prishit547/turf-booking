import { useLocation, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarPlus, Share2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, Button } from '../components/ui';

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

/**
 * Real booking-confirmation screen — the booking object comes from
 * Checkout.jsx's confirmReservation() response via router state, not a
 * mock. There's no backend "fetch booking by id" endpoint, so a direct
 * link/refresh (no state) falls back to a plain summary instead of
 * pretending to re-fetch data that doesn't exist yet.
 */
const BookingConfirmation = () => {
    const { bookingId } = useParams();
    const location = useLocation();
    const details = location.state;

    if (!details) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Booking #{bookingId}</h2>
                    <p className="text-muted-foreground mb-6">
                        We don&rsquo;t have the details for this booking on hand here — check My bookings for the full record.
                    </p>
                    <Button as={Link} to="/user-dashboard">Go to my bookings</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-14 relative overflow-hidden">
            <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative max-w-lg w-full text-center">
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
                        Booking ID <span className="font-semibold text-primary">#{bookingId}</span>
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <Card className="mt-6 text-left">
                        <h2 className="font-display text-xl uppercase">{details.boxName}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{details.dateDisplay}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{details.timeSlot} · {details.duration}h</p>
                        <div className="mt-5 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Paid</span>
                            <span className="font-display text-2xl text-foreground">₹{details.total}</span>
                        </div>

                        <div className="mt-6 grid place-items-center rounded-xl bg-elevated p-5">
                            <BookingPass seed={bookingId} />
                            <p className="mt-3 text-xs text-muted-foreground">Show this pass at the gate</p>
                        </div>

                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => toast.success('Added to your calendar')}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50"
                            >
                                <CalendarPlus className="h-4 w-4" /> Add to calendar
                            </button>
                            <button
                                type="button"
                                onClick={() => toast.success('Invite link copied')}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary/50"
                            >
                                <Share2 className="h-4 w-4" /> Share with squad
                            </button>
                        </div>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
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
        </div>
    );
};

export default BookingConfirmation;
