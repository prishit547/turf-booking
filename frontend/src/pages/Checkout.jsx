import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Smartphone, CreditCard, Wallet, Ticket, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, Button, Input } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';
import { useBooking } from '../context/BookingContext';
import { useSlotReservation } from '../hooks/useSlotReservation';
import { useAuth } from '../api.jsx';

const PAYMENT_METHODS = [
    { id: 'upi', label: 'UPI', Icon: Smartphone },
    { id: 'card', label: 'Card', Icon: CreditCard },
    { id: 'wallet', label: 'Wallet', Icon: Wallet },
];

/**
 * Real order-review + confirm step. Re-opens the same live hold/queue
 * WebSocket the booking panel started (seeded from the reserveSlot()
 * result BoxDetails.jsx already has), so status stays accurate across the
 * page navigation instead of freezing at whatever it was on handoff.
 *
 * The payment-method selector and coupon field are presentational only —
 * there's no payment gateway or coupon system behind this app. They're
 * included for visual parity with the reference design but never claim to
 * do anything; the only real action is "Confirm booking".
 */
const Checkout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const draft = location.state;
    const { confirmReservation, releaseHold } = useBooking();
    const { accessToken, user } = useAuth();

    const [selectedPayment, setSelectedPayment] = useState('upi');
    const [couponCode, setCouponCode] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [details, setDetails] = useState({
        name: user?.name || '',
        phone: user?.phone || '',
        email: user?.email || '',
    });

    const liveReservation = useSlotReservation({
        boxId: draft?.boxId,
        date: draft?.date,
        startTime: draft?.timeSlot,
        duration: draft?.duration,
        holdToken: draft?.holdToken,
        accessToken,
        currentUserId: user?.id,
        enabled: Boolean(draft),
        initialStatus: draft?.initialStatus,
        initialPosition: draft?.initialPosition,
        initialExpiresAt: draft?.initialExpiresAt,
    });

    useEffect(() => {
        if (liveReservation.status === 'lost') {
            toast.error('This slot was just booked by someone else.');
            navigate(draft?.boxId ? `/boxes/${draft.boxId}` : '/boxes');
        }
    }, [liveReservation.status, navigate, draft?.boxId]);

    const wasQueuedRef = useRef(false);
    useEffect(() => {
        if (liveReservation.status === 'queued') {
            wasQueuedRef.current = true;
        } else if (liveReservation.status === 'held' && wasQueuedRef.current) {
            wasQueuedRef.current = false;
            toast.info("It's your turn! Please confirm your booking.");
        }
    }, [liveReservation.status]);

    if (!draft) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Nothing to check out</h2>
                    <p className="text-muted-foreground mb-6">Pick a time slot on a box&apos;s page first.</p>
                    <Button as={Link} to="/boxes">Browse boxes</Button>
                </Card>
            </div>
        );
    }

    const total = draft.pricePerHour * draft.duration;
    const isQueued = liveReservation.status === 'queued';

    const handleApplyCoupon = () => {
        if (!couponCode.trim()) return;
        toast.info("Coupons aren't available yet — this slot is display only.");
    };

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            const result = await confirmReservation(draft.holdToken);
            if (result.success) {
                navigate(`/booking/${result.data.id}`, {
                    state: {
                        booking: result.data,
                        boxName: draft.boxName,
                        dateDisplay: draft.dateDisplay,
                        timeSlot: draft.timeSlot,
                        duration: draft.duration,
                        total,
                    },
                });
            } else {
                toast.error(`Booking failed: ${result.error || 'Please try again.'}`);
            }
        } finally {
            setConfirming(false);
        }
    };

    const handleLeave = async () => {
        setLeaving(true);
        try {
            await releaseHold(draft.holdToken);
        } finally {
            setLeaving(false);
            navigate(`/boxes/${draft.boxId}`);
        }
    };

    return (
        <div className="min-h-screen pb-20 px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-5xl mx-auto">
                <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-foreground mb-8">
                    Checkout
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                    <div className="space-y-6">
                        {isQueued ? (
                            <Card className="text-center bg-warning/10 border-warning/30">
                                <p className="text-warning font-medium">Someone else is currently confirming this slot.</p>
                                <p className="text-warning/80 text-sm mt-1">
                                    You&rsquo;re #{liveReservation.position} in the queue — we&rsquo;ll notify you the moment it&rsquo;s your turn.
                                </p>
                            </Card>
                        ) : (
                            <Card className="text-center bg-primary/10 border-primary/30">
                                <p className="text-primary font-medium">
                                    {liveReservation.secondsRemaining != null
                                        ? `Confirm within ${Math.floor(liveReservation.secondsRemaining / 60)}:${String(liveReservation.secondsRemaining % 60).padStart(2, '0')}`
                                        : 'This slot is held for you'}
                                </p>
                                <p className="text-primary/80 text-sm mt-1">
                                    If you don&rsquo;t confirm in time, it&rsquo;s released to the next person waiting.
                                </p>
                            </Card>
                        )}

                        <Card>
                            <h3 className="font-display font-semibold text-foreground mb-4">Your details</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                    label="Name"
                                    value={details.name}
                                    onChange={(e) => setDetails({ ...details, name: e.target.value })}
                                />
                                <Input
                                    label="Phone"
                                    value={details.phone}
                                    onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                                />
                                <div className="sm:col-span-2">
                                    <Input
                                        label="Email"
                                        value={details.email}
                                        onChange={(e) => setDetails({ ...details, email: e.target.value })}
                                    />
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                                <ShieldCheck size={18} className="text-primary" /> Payment method
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                {PAYMENT_METHODS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedPayment(id)}
                                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-medium transition-colors ${
                                            selectedPayment === id
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border text-muted-foreground hover:border-primary/50'
                                        }`}
                                    >
                                        <Icon size={20} />
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                                Demo only — payment methods are for display; bookings are confirmed here and settled at the venue.
                            </p>
                        </Card>

                        <Card>
                            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Ticket size={18} className="text-primary" /> Offer code
                            </h3>
                            <div className="flex gap-3">
                                <input
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value)}
                                    placeholder="Enter code"
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-elevated border border-input text-foreground outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder-muted-foreground"
                                />
                                <Button variant="outline" onClick={handleApplyCoupon}>Apply</Button>
                            </div>
                        </Card>
                    </div>

                    <div>
                        <Card className="sticky top-24">
                            <h3 className="font-display font-semibold text-foreground mb-4">{draft.boxName}</h3>
                            <div className="space-y-2 text-sm text-muted-foreground mb-4">
                                <div className="flex justify-between"><span>Date</span><span className="text-foreground">{draft.dateDisplay}</span></div>
                                <div className="flex justify-between"><span>Time</span><span className="text-foreground">{draft.timeSlot}</span></div>
                                <div className="flex justify-between"><span>Duration</span><span className="text-foreground">{draft.duration} hour{draft.duration > 1 ? 's' : ''}</span></div>
                            </div>
                            <div className="border-t border-border pt-4 mb-6">
                                <div className="flex justify-between items-center font-display font-bold text-lg text-foreground">
                                    <span>Total</span>
                                    <span className="text-primary">₹{total}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {isQueued ? (
                                    <Button variant="outline" fullWidth onClick={handleLeave} loading={leaving} disabled={leaving}>
                                        Leave queue
                                    </Button>
                                ) : (
                                    <>
                                        <MagneticButton
                                            className="w-full"
                                            disabled={confirming}
                                            onClick={handleConfirm}
                                        >
                                            {confirming ? 'Confirming…' : `Confirm booking · ₹${total}`}
                                        </MagneticButton>
                                        <Button variant="outline" fullWidth onClick={handleLeave} loading={leaving} disabled={leaving}>
                                            Cancel
                                        </Button>
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-3 text-center">
                                Free cancellation up to 2 hours before booking time
                            </p>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Checkout;
