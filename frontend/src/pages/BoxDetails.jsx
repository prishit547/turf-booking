import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import { Star, MapPin, Users, Wifi, Car, Coffee, Shield, CalendarDays, ArrowLeft, Heart } from 'lucide-react';
import { useBooking } from '../context/BookingContext';
import { Loader, Card, Button, Select, DateStrip, SlotGrid, SlotLegend, BookingSummaryBar } from '../components/ui';
import Chatbot from '../components/common/Chatbot';
import AddReviewForm from '../components/common/AddReviewForm';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

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

    const handleAddToFavorites = async () => {
        if (!user) {
            toast.info('Please login to add to favorites');
            return;
        }
        setFavoriteLoading(true);
        try {
            await api.post('/dashboard/favorites/', { box_id: box.id });
            toast.success('Added to favorites!');
            setIsFavorite(true);
            window.dispatchEvent(new Event('favorite-added'));
        } catch {
            toast.error('Could not add to favorites');
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

    const timeSlots = [
        '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
        '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
        '18:00', '19:00', '20:00', '21:00', '22:00'
    ];

    const isTimeSlotAvailable = (timeSlot) => {
        if (!timeSlot || bookedSlots.length === 0) return true;
        const selectedHour = parseInt(timeSlot.split(':')[0]);
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

    return (
        <div className="min-h-screen pb-24">
            <div className="border-b border-border pt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            to="/boxes"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
                        >
                            <ArrowLeft size={18} />
                            <span className="text-sm font-medium">Back</span>
                        </Link>
                        <h2 className="text-lg font-display font-semibold text-foreground">Box details</h2>
                        <div className="w-20" />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <Card padding="none" className="overflow-hidden">
                            <Swiper
                                modules={[Navigation, Pagination, Autoplay]}
                                navigation
                                pagination={{ clickable: true }}
                                autoplay={{ delay: 5000 }}
                                className="h-96"
                            >
                                {box.images?.map((image, index) => (
                                    <SwiperSlide key={index}>
                                        <img src={image} alt={`${box.name} - Image ${index + 1}`} className="w-full h-full object-cover" />
                                    </SwiperSlide>
                                ))}
                            </Swiper>
                        </Card>

                        <Card>
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <h1 className="text-3xl font-display font-bold text-foreground mb-2">{box.name}</h1>
                                    <div className="flex items-center gap-4 text-muted-foreground">
                                        <div className="flex items-center gap-1.5"><MapPin size={18} />{box.location}</div>
                                        <div className="flex items-center gap-1.5"><Users size={18} />Up to {box.capacity} players</div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="flex items-center justify-end gap-1 mb-2">
                                        <Star size={18} className="text-warning fill-warning" />
                                        <span className="text-xl font-display font-semibold text-foreground">
                                            {typeof box.rating === 'number' ? box.rating.toFixed(1) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="text-2xl font-display font-bold text-primary mb-4">₹{box.price}/hr</div>
                                    {user && (
                                        <Button
                                            onClick={handleAddToFavorites}
                                            variant={isFavorite ? 'outline' : 'primary'}
                                            size="sm"
                                            icon={<Heart size={16} className={isFavorite ? 'fill-current text-danger' : ''} />}
                                            loading={favoriteLoading}
                                            disabled={isFavorite}
                                        >
                                            {isFavorite ? 'Added to favorites' : 'Add to favorites'}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-border pt-4">
                                <h3 className="text-lg font-display font-semibold text-foreground mb-3">Description</h3>
                                <p className="text-muted-foreground leading-relaxed">{box.fullDescription || box.description}</p>
                            </div>
                        </Card>

                        <Card>
                            <h3 className="text-lg font-display font-semibold text-foreground mb-4">Amenities</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {box.amenities && Array.isArray(box.amenities) && box.amenities.length > 0 ? box.amenities.map((amenity, index) => {
                                    const IconComponent = amenityIcons[amenity] || Shield;
                                    return (
                                        <div key={index} className="flex items-center gap-2 text-foreground">
                                            <IconComponent size={18} className="text-primary" />
                                            <span>{amenity}</span>
                                        </div>
                                    );
                                }) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Shield size={18} className="text-primary" />
                                        <span>No amenities listed</span>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {box.rules && (
                            <Card>
                                <h3 className="text-lg font-display font-semibold text-foreground mb-4">Rules &amp; guidelines</h3>
                                <ul className="space-y-2">
                                    {Array.isArray(box.rules) ? box.rules.map((rule, index) => (
                                        <li key={index} className="flex items-start gap-2 text-foreground">
                                            <span className="text-primary mt-1">•</span>
                                            <span>{rule}</span>
                                        </li>
                                    )) : (
                                        <li className="flex items-start gap-2 text-foreground">
                                            <span className="text-primary mt-1">•</span>
                                            <span>{box.rules || 'No specific rules provided'}</span>
                                        </li>
                                    )}
                                </ul>
                            </Card>
                        )}

                        {box.reviews && (
                            <Card>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-display font-semibold text-foreground">Reviews</h3>
                                    {isAuthenticated && (
                                        <Button onClick={() => setShowReviewModal(true)} size="sm" icon={<Star size={16} />}>
                                            Add review
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {Array.isArray(box.reviews) && box.reviews.length > 0 ? box.reviews.map((review) => (
                                        <div key={review.id} className="border-b border-border pb-4 last:border-b-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-medium">
                                                        {review.user.charAt(0)}
                                                    </div>
                                                    <span className="font-medium text-foreground">{review.user}</span>
                                                </div>
                                                <div className="flex items-center">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star key={i} size={16} className={i < review.rating ? 'text-warning fill-warning' : 'text-border'} />
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-muted-foreground">{review.comment}</p>
                                            <p className="text-sm text-muted-foreground/70 mt-1">{review.date}</p>
                                        </div>
                                    )) : (
                                        <div className="text-center py-8">
                                            <p className="text-muted-foreground">No reviews yet. Be the first to review this box!</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}
                    </div>

                    <div className="lg:col-span-1">
                        <Card className="sticky top-24">
                            <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                                <CalendarDays size={20} />
                                Book this box
                            </h3>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-foreground mb-2">Select date</label>
                                <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-foreground mb-2">Select time slot</label>
                                <SlotGrid
                                    timeSlots={timeSlots}
                                    selectedTimeSlot={selectedTimeSlot}
                                    onSelect={setSelectedTimeSlot}
                                    isTimeSlotBooked={isTimeSlotBooked}
                                    isTimeSlotAvailable={isTimeSlotAvailable}
                                    loading={slotsLoading}
                                />
                                <SlotLegend />
                            </div>

                            <div className="mb-6">
                                <Select label="Duration (hours)" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))}>
                                    {[1, 2, 3, 4, 5, 6].map((hour) => (
                                        <option key={hour} value={hour}>{hour} hour{hour > 1 ? 's' : ''}</option>
                                    ))}
                                </Select>
                            </div>

                            <div className="mb-6 p-4 bg-elevated rounded-lg text-foreground">
                                <div className="flex justify-between items-center mb-2 text-sm">
                                    <span>Price per hour:</span>
                                    <span>₹{box.price}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2 text-sm">
                                    <span>Duration:</span>
                                    <span>{duration} hour{duration > 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex justify-between items-center font-display font-semibold text-lg border-t border-border pt-2">
                                    <span>Total:</span>
                                    <span className="text-primary">₹{box.price * duration}</span>
                                </div>
                            </div>

                            <Button
                                onClick={handleBookNowClick}
                                size="lg"
                                fullWidth
                                disabled={!selectedTimeSlot || reservationLoading}
                                loading={reservationLoading}
                            >
                                {reservationLoading ? 'Checking availability...' : 'Book now'}
                            </Button>

                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                Free cancellation up to 2 hours before booking time
                            </p>
                        </Card>
                    </div>
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
