import { useLocation, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarPlus } from 'lucide-react';
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
            <div className="min-h-screen flex items-center justify-center px-4 pt-16">
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
        <div className="min-h-screen flex items-center justify-center px-4 py-24 relative overflow-hidden">
            <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative max-w-md w-full">
                <SuccessBurst />

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-6"
                >
                    <h1 className="font-display font-black uppercase tracking-tight text-3xl text-foreground">
                        You&rsquo;re on
                    </h1>
                    <p className="text-muted-foreground mt-1">Booking #{bookingId}</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                    <Card className="mt-6">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Venue</span><span className="text-foreground font-medium">{details.boxName}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="text-foreground font-medium">{details.dateDisplay}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="text-foreground font-medium">{details.timeSlot} · {details.duration}h</span></div>
                            <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-muted-foreground">Total paid</span><span className="text-primary font-display font-bold">₹{details.total}</span></div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="flex gap-3 mt-6"
                >
                    <Button
                        variant="outline"
                        fullWidth
                        icon={<CalendarPlus size={16} />}
                        onClick={() => toast.info('Calendar export is coming soon.')}
                    >
                        Add to calendar
                    </Button>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="flex flex-col sm:flex-row gap-3 mt-3"
                >
                    <Button as={Link} to="/user-dashboard" fullWidth icon={<LayoutDashboard size={16} />}>
                        My bookings
                    </Button>
                    <Button as={Link} to="/boxes" variant="outline" fullWidth>
                        Book another
                    </Button>
                </motion.div>
            </div>
        </div>
    );
};

export default BookingConfirmation;
