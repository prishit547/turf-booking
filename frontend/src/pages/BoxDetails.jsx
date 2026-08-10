import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Star, MapPin, Users, Wifi, Car, Coffee, Shield, ArrowLeft, Heart, Check, Map as MapIcon, X } from 'lucide-react';
import { useBooking } from '../context/BookingContext';
import { Loader, Card, Button, Select, DateStrip, SlotGrid, SlotLegend, BookingSummaryBar, RatingStars } from '../components/ui';
import Chatbot from '../components/common/Chatbot';
import AddReviewForm from '../components/common/AddReviewForm';
import BoxListingsMap from '../components/maps/BoxListingsMap';

import { api, useAuth } from '../api.jsx'
import { formatLocalDate } from '../utils/date'
import { toast } from 'react-toastify';

const amenityIcons = {
    'Changing Room': Users,
    'Parking': Car,
    'Equipment': Shield,
    'WiFi': Wifi,
    'Refreshments': Coffee,
    'Security': Shield
};

const BoxDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [box, setBox] = useState(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
    const [duration, setDuration] = useState(1);
    const [error, setError] = useState(null);
    const [bookedSlots, setBookedSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reservationLoading, setReservationLoading] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const [showMap, setShowMap] = useState(false);
    const { reserveSlot } = useBooking();
    const { isAuthenticated, user } = useAuth();

    useEffect(() => {
        const checkFavorite = async () => {
            if (!user || !box?.id) return;
            try {
                const res = await api.get('/dashboard/favorites/');
                const favs = res.data || [];
                setIsFavorite(favs.some(fav => fav.id === box.id));
            } catch {
                // Ignore error
            }
        };
        checkFavorite();
    }, [user, box?.id]);

    const refreshBookedSlots = useCallback(async () => {
        if (!box?.id || !selectedDate) return;

        setSlotsLoading(true);
        try {
            const dateString = formatLocalDate(selectedDate);
            const response = await api.get(`/bookings/booked_slots/?box_id=${box.id}&date=${dateString}`);
            setBookedSlots(response.data.booked_slots || []);
        } catch (error) {
            console.error('Error fetching booked slots:', error);
            setBookedSlots([]);
        } finally {
            setSlotsLoading(false);
        }
    }, [box?.id, selectedDate]);

    useEffect(() => {
        refreshBookedSlots();
        const intervalId = setInterval(refreshBookedSlots, 30000);
        return () => clearInterval(intervalId);
    }, [refreshBookedSlots]);

    const toggleFavorite = async () => {
        if (!user) {
            toast.info('Please login to add to favorites');
            return;
        }
        setFavoriteLoading(true);
        try {
            if (isFavorite) {
                await api.delete(`/dashboard/favorites/${box.id}/remove/`);
                toast.success('Removed from favorites');
                setIsFavorite(false);
            } else {
                await api.post('/dashboard/favorites/', { box_id: box.id });
                toast.success('Added to favorites!');
                setIsFavorite(true);
            }
            window.dispatchEvent(new Event('favorite-added'));
        } catch {
            toast.error('Could not update favorites');
        } finally {
            setFavoriteLoading(false);
        }
    };

    useEffect(() => {
        const fetchBoxDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get(`/boxes/public/${id}/`);
                const fetchedBox = response.data;
                if (fetchedBox && typeof fetchedBox.rating === 'string') {
                    fetchedBox.rating = parseFloat(fetchedBox.rating);
                }
                if (fetchedBox && (fetchedBox.rating === undefined || fetchedBox.rating === null)) {
                    fetchedBox.rating = 0;
                }
                setBox(fetchedBox);
            } catch (err) {
                console.error('Error fetching box details:', err);
                setError('Failed to load box details. Please try again later.');
                setBox(null);
            } finally {
                setLoading(false);
            }
        };

        fetchBoxDetails();
    }, [id]);

    // Every box has its own owner-configured opening/closing hours
    // (`box.opening_time`/`box.closing_time`, "HH:MM") — slots are generated
    // from those instead of a single hardcoded 06:00-22:00 range shared by
    // every box. Falls back to the same 06:00-23:00 defaults the backend
    // uses for boxes created before this field existed.
    const openingHour = parseInt((box?.opening_time || '06:00').split(':')[0]);
    const closingHour = parseInt((box?.closing_time || '23:00').split(':')[0]);
    const timeSlots = [];
    for (let h = openingHour; h < closingHour; h++) {
        timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    }

    const isTimeSlotAvailable = (timeSlot) => {
        if (!timeSlot) return true;
        const selectedHour = parseInt(timeSlot.split(':')[0]);
        // A duration that would run past closing time isn't offerable,
        // regardless of what's already booked.
        if (selectedHour + duration > closingHour) return false;
        if (bookedSlots.length === 0) return true;
        for (let i = 0; i < duration; i++) {
            const checkHour = selectedHour + i;
            const checkTime = `${checkHour.toString().padStart(2, '0')}:00`;
            if (bookedSlots.includes(checkTime)) return false;
        }
        return true;
    };

    const isTimeSlotBooked = (timeSlot) => bookedSlots.includes(timeSlot);

    const handleReviewAdded = (newReview) => {
        setBox(prevBox => ({
            ...prevBox,
            reviews: [newReview, ...(prevBox.reviews || [])]
        }));
        setShowReviewModal(false);
        setTimeout(() => {
            const fetchBoxDetails = async () => {
                try {
                    const response = await api.get(`/boxes/public/${id}/`);
                    const fetchedBox = response.data;
                    if (fetchedBox && typeof fetchedBox.rating === 'string') {
                        fetchedBox.rating = parseFloat(fetchedBox.rating);
                    }
                    if (fetchedBox && (fetchedBox.rating === undefined || fetchedBox.rating === null)) {
                        fetchedBox.rating = 0;
                    }
                    setBox(fetchedBox);
                } catch (err) {
                    console.error('Error refreshing box details:', err);
                }
            };
            fetchBoxDetails();
        }, 1000);
    };

    // Claims the slot (or joins its queue) over HTTP, then hands off to the
    // /checkout route — which re-opens the same live hold/queue WebSocket
    // (via useSlotReservation) seeded from the result below, so the
    // real-time status tracking carries over instead of being torn down
    // when this page unmounts.
    const handleBookNowClick = async () => {
        if (!isAuthenticated) {
            toast.info('Please login to book a box');
            return;
        }
        if (!selectedTimeSlot) {
            toast.info('Please select a time slot');
            return;
        }
        if (!isTimeSlotAvailable(selectedTimeSlot)) {
            toast.error('Selected time slot is not available. Please choose a different time.');
            return;
        }

        setReservationLoading(true);
        const result = await reserveSlot({
            boxId: box.id,
            date: formatLocalDate(selectedDate),
            startTime: selectedTimeSlot,
            duration,
        });
        setReservationLoading(false);

        if (!result.success) {
            toast.error(result.error || 'Could not reserve this slot.');
            if (result.unavailable) refreshBookedSlots();
            return;
        }

        if (result.status === 'queued') {
            toast.info(`This slot is currently held by someone else — you're #${result.position} in the queue.`);
        }

        navigate('/checkout', {
            state: {
                boxId: box.id,
                boxName: box.name,
                boxImage: box.images?.[0],
                pricePerHour: box.price,
                date: formatLocalDate(selectedDate),
                dateDisplay: selectedDate.toLocaleDateString(),
                timeSlot: selectedTimeSlot,
                duration,
                holdToken: result.hold_token,
                initialStatus: result.status,
                initialPosition: result.position,
                initialExpiresAt: result.expires_at,
            },
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader text="Loading box details..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <h2 className="text-2xl font-display font-semibold text-danger mb-4">Error</h2>
                    <p className="text-muted-foreground mb-6">{error}</p>
                    <Button as={Link} to="/boxes">Browse other boxes</Button>
                </Card>
            </div>
        );
    }

    if (!box) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="text-center max-w-md">
                    <h2 className="text-2xl font-display font-semibold text-foreground mb-4">Box not found</h2>
                    <p className="text-muted-foreground mb-6">The box you are looking for does not exist or has been removed.</p>
                    <Button as={Link} to="/boxes">Browse other boxes</Button>
                </Card>
            </div>
        );
    }

    const images = box.images?.length ? box.images : [box.image];

    return (
        <div className="min-h-screen pb-28">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <Link to="/boxes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> All boxes
                </Link>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {images.map((img, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setLightbox(img)}
                            className={`group relative overflow-hidden rounded-2xl border border-border ${i === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}
                        >
                            <img
                                src={img}
                                alt={`${box.name} photo ${i + 1}`}
                                loading={i === 0 ? 'eager' : 'lazy'}
                                className="h-48 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-full"
                            />
                        </button>
                    ))}
                </div>

                <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="font-display text-3xl uppercase sm:text-4xl">{box.name}</h1>
                        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" /> {box.location}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-turf/15 px-2.5 py-1 text-xs font-medium text-turf">
                                {box.sport || 'Multi-sport'}
                            </span>
                            <span className="rounded-full bg-elevated px-2.5 py-1 text-xs text-muted-foreground">
                                Up to {box.capacity} players
                            </span>
                            <button
                                type="button"
                                onClick={toggleFavorite}
                                disabled={favoriteLoading}
                                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-60"
                            >
                                <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-primary text-primary' : ''}`} />
                                {isFavorite ? 'Saved' : 'Save'}
                            </button>
                        </div>
                    </div>
                    <RatingStars rating={box.rating || 0} count={box.reviews?.length} className="text-base" />
                </header>

                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {box.fullDescription || box.description}
                </p>

                <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
                    <section className="min-w-0">
                        <h2 className="font-display text-2xl uppercase">Pick your slot</h2>
                        <div className="mt-4">
                            <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                        </div>

                        <div className="mt-4 max-w-[12rem]">
                            <Select label="Duration (hours)" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))}>
                                {[1, 2, 3, 4, 5, 6].map((hour) => (
                                    <option key={hour} value={hour}>{hour} hour{hour > 1 ? 's' : ''}</option>
                                ))}
                            </Select>
                        </div>

                        <div className="mt-5">
                            <SlotGrid
                                timeSlots={timeSlots}
                                selectedTimeSlot={selectedTimeSlot}
                                onSelect={setSelectedTimeSlot}
                                isTimeSlotBooked={isTimeSlotBooked}
                                isTimeSlotAvailable={isTimeSlotAvailable}
                                loading={slotsLoading}
                                duration={duration}
                            />
                        </div>
                        <div className="mt-4">
                            <SlotLegend />
                        </div>

                        <h2 className="mt-12 font-display text-2xl uppercase">Reviews</h2>
                        <div className="mt-4 space-y-3">
                            {isAuthenticated && (
                                <Button onClick={() => setShowReviewModal(true)} size="sm" icon={<Star size={16} />}>
                                    Add review
                                </Button>
                            )}
                            {(!box.reviews || box.reviews.length === 0) && (
                                <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                                    No reviews yet — be the first to play here.
                                </p>
                            )}
                            {Array.isArray(box.reviews) && box.reviews.map((review) => (
                                <article key={review.id} className="rounded-2xl border border-border bg-card p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-display text-sm uppercase">{review.user}</p>
                                        <RatingStars rating={review.rating} />
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                                    <p className="mt-2 text-xs text-muted-foreground">{review.date}</p>
                                </article>
                            ))}
                        </div>
                    </section>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-border bg-card p-5">
                            <h3 className="font-display text-sm uppercase tracking-wide text-muted-foreground">Pricing</h3>
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">Per hour</dt>
                                    <dd className="font-semibold text-primary">₹{box.price}/hr</dd>
                                </div>
                            </dl>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-5">
                            <h3 className="font-display text-sm uppercase tracking-wide text-muted-foreground">Amenities</h3>
                            {box.amenities?.length > 0 ? (
                                <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    {box.amenities.map((a) => {
                                        const IconComponent = amenityIcons[a] || Check;
                                        return (
                                            <li key={a} className="flex items-center gap-1.5 text-muted-foreground">
                                                <IconComponent className="h-3.5 w-3.5 text-primary" /> {a}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">No amenities listed</p>
                            )}
                        </div>

                        {box.rules && (
                            <div className="rounded-2xl border border-border bg-card p-5">
                                <h3 className="font-display text-sm uppercase tracking-wide text-muted-foreground">Rules</h3>
                                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                                    {(Array.isArray(box.rules) ? box.rules : [box.rules]).map((rule, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <span className="text-primary">•</span> {rule}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowMap(true)}
                            className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-elevated text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                        >
                            <MapIcon className="h-5 w-5 text-primary" />
                            View {box.location} on map
                        </button>
                    </aside>
                </div>
            </div>

            <BookingSummaryBar
                visible={Boolean(selectedTimeSlot)}
                boxName={box.name}
                date={selectedDate.toLocaleDateString()}
                timeSlot={selectedTimeSlot}
                duration={duration}
                total={box.price * duration}
                onContinue={handleBookNowClick}
                loading={reservationLoading}
            />

            <AnimatePresence>
                {lightbox && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6"
                        onClick={() => setLightbox(null)}
                    >
                        <button
                            type="button"
                            aria-label="Close gallery"
                            className="absolute right-5 top-5 text-foreground"
                            onClick={() => setLightbox(null)}
                        >
                            <X className="h-6 w-6" />
                        </button>
                        <motion.img
                            initial={{ scale: 0.94 }}
                            animate={{ scale: 1 }}
                            src={lightbox}
                            alt={`${box.name} full size`}
                            className="max-h-[85vh] w-auto rounded-2xl"
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <BoxListingsMap isOpen={showMap} onClose={() => setShowMap(false)} boxes={box.coordinates ? [box] : []} />

            <AddReviewForm
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                boxId={box.id}
                onReviewAdded={handleReviewAdded}
            />

            <Chatbot />
        </div>
    );
};

export default BoxDetails;
