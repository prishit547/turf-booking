import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Smartphone, CreditCard, Wallet, Ticket, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, Button, Input } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';
import { useBooking } from '../context/BookingContext';
import { useSlotReservation } from '../hooks/useSlotReservation';
import { useAuth, api } from '../api.jsx';

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
 * The payment-method selector is still presentational only — there's no
 * payment gateway behind this app. The coupon field, however, is real:
 * "Apply" calls a server-side dry-run validate endpoint, and the applied
 * code rides along with the confirm call so the discount is recomputed
 * (and actually charged) server-side, never trusted from this component.
 */
const Checkout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const draft = location.state;
    const { confirmReservation, releaseHold } = useBooking();
    const { accessToken, user } = useAuth();
    const isStaffAccount = user?.role === 'admin' || user?.role === 'owner';

    const [selectedPayment, setSelectedPayment] = useState('upi');
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [applyingCoupon, setApplyingCoupon] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [walletBalance, setWalletBalance] = useState(0);
    const [useWallet, setUseWallet] = useState(false);
    // Resolved via /bookings/price-preview/ — draft.pricePerHour is the
    // box's flat rate handed off from BoxDetails, but a PricingRule can
    // override it for this exact date/time (see boxes/pricing.py's
    // resolve_box_price()). null while unresolved — falls back to the
    // naive flat-rate multiply below so the page never shows a blank total.
    const [resolvedRate, setResolvedRate] = useState(null);
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
        } else if (liveReservation.status === 'owner_reserved') {
            toast.error(liveReservation.message || 'This slot has been reserved by the turf owner. Please select another slot.');
            navigate(draft?.boxId ? `/boxes/${draft.boxId}` : '/boxes');
        }
    }, [liveReservation.status, liveReservation.message, navigate, draft?.boxId]);

    useEffect(() => {
        if (!draft) return undefined;
        let cancelled = false;
        api.post('/bookings/price-preview/', {
            boxId: draft.boxId,
            date: draft.date,
            startTime: draft.timeSlot,
            duration: draft.duration,
        }).then((response) => {
            if (!cancelled) setResolvedRate(response.data);
        }).catch(() => {
            if (!cancelled) setResolvedRate(null);
        });
        return () => { cancelled = true; };
    }, [draft]);

    useEffect(() => {
        let cancelled = false;
        api.get('/rewards/wallet/').then((response) => {
            if (!cancelled) setWalletBalance(Number(response.data.balance) || 0);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

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

    // Defense in depth: BoxDetails.jsx already keeps admin/owner accounts
    // from ever reaching this page with a valid hold (reserveSlot is
    // rejected server-side by IsCustomerUser before a hold token can
    // exist), but block here too in case this is reached directly by URL.
    if (isStaffAccount) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
                    <h2 className="text-2xl font-display font-semibold text-foreground mb-2">Booking not available</h2>
                    <p className="text-muted-foreground mb-6">
                        Only customer accounts can book a slot. Facility owners can add walk-in bookings from their
                        dashboard instead.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button as={Link} to="/boxes">Browse boxes</Button>
                        {user?.role === 'owner' && (
                            <Button as={Link} to="/owner-dashboard" variant="outline">Go to owner dashboard</Button>
                        )}
                    </div>
                </Card>
            </div>
        );
    }

    const grossTotal = resolvedRate ? Number(resolvedRate.total) : draft.pricePerHour * draft.duration;
    const total = appliedCoupon ? Number(appliedCoupon.final_amount) : grossTotal;
    const walletDeduction = useWallet ? Math.min(walletBalance, total) : 0;
    const amountDue = total - walletDeduction;
    const isQueued = liveReservation.status === 'queued';

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;
        setApplyingCoupon(true);
        try {
            const response = await api.post('/bookings/coupons/validate/', {
                code: couponCode.trim(),
                boxId: draft.boxId,
                date: draft.date,
                startTime: draft.timeSlot,
                duration: draft.duration,
            });
            setAppliedCoupon(response.data);
            toast.success(`Coupon applied — you save ₹${Number(response.data.discount_amount).toFixed(0)}.`);
        } catch (error) {
            setAppliedCoupon(null);
            toast.error(error.response?.data?.detail || 'Invalid coupon code.');
        } finally {
            setApplyingCoupon(false);
        }
    };

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            // appliedCoupon.kind tells us which model the code belongs to
            // (see bookings/views.py::validate_coupon) — coupon and
            // redeem-code are mutually exclusive at confirm time.
            const codeParams = appliedCoupon?.kind === 'redeem_code'
                ? { redeemCode: appliedCoupon.code }
                : appliedCoupon?.code ? { couponCode: appliedCoupon.code } : {};
            const result = await confirmReservation(draft.holdToken, { ...codeParams, useWallet });
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
            <Helmet>
                <title>Checkout | BoxNplay</title>
                <meta name="robots" content="noindex, nofollow" />
            </Helmet>
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
                                <Ticket size={18} className="text-primary" /> Coupon / promo code
                            </h3>
                            {appliedCoupon ? (
                                <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-4 py-2.5">
                                    <span className="text-sm font-medium text-success">
                                        {appliedCoupon.code} applied — you save ₹{Number(appliedCoupon.discount_amount).toFixed(0)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                                        className="text-xs text-muted-foreground hover:text-foreground underline"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-3">
                                    <input
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        placeholder="Enter coupon or promo code"
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-elevated border border-input text-foreground outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder-muted-foreground"
                                    />
                                    <Button variant="outline" onClick={handleApplyCoupon} loading={applyingCoupon} disabled={applyingCoupon}>
                                        Apply
                                    </Button>
                                </div>
                            )}
                        </Card>

                        {walletBalance > 0 && (
                            <Card>
                                <label className="flex items-center justify-between gap-3 cursor-pointer">
                                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <Wallet size={18} className="text-primary" /> Use wallet balance (₹{walletBalance} available)
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={useWallet}
                                        onChange={(e) => setUseWallet(e.target.checked)}
                                        className="w-5 h-5 rounded accent-primary"
                                    />
                                </label>
                            </Card>
                        )}
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
                                {appliedCoupon && (
                                    <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
                                        <span>Subtotal</span>
                                        <span className="line-through">₹{grossTotal}</span>
                                    </div>
                                )}
                                {walletDeduction > 0 && (
                                    <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
                                        <span>Wallet applied</span>
                                        <span className="text-success">-₹{walletDeduction}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center font-display font-bold text-lg text-foreground">
                                    <span>{walletDeduction > 0 ? 'Amount due' : 'Total'}</span>
                                    <span className="text-primary">₹{amountDue}</span>
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
                                            {confirming ? 'Confirming…' : `Confirm booking · ₹${amountDue}`}
                                        </MagneticButton>
                                        <Button variant="outline" fullWidth onClick={handleLeave} loading={leaving} disabled={leaving}>
                                            Cancel
                                        </Button>
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-3 text-center">
                                Free cancellation up to 2 hours before booking time —{' '}
                                <Link to="/cancellation-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline underline-offset-2">
                                    see our policy
                                </Link>
                            </p>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Checkout;
