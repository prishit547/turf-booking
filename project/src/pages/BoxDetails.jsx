import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import { Star, MapPin, Users, Wifi, Car, Coffee, Shield, Calendar as CalendarIcon, ArrowLeft, Heart } from 'lucide-react';
import Calendar from 'react-calendar';
import { useBox } from '../context/BoxContext';
import { useBooking } from '../context/BookingContext';
import { useSlotReservation } from '../hooks/useSlotReservation';
import Modal from '../components/common/Modal';
import Loader from '../components/common/Loader';
import Chatbot from '../components/common/Chatbot';
import AddReviewForm from '../components/common/AddReviewForm';
import { EnhancedButton } from '../components/common/EnhancedComponents';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'react-calendar/dist/Calendar.css';

// Assuming your api.js exports an axios instance
import { api, useAuth } from '../api.jsx'
import { formatLocalDate } from '../utils/date'
import { toast } from 'react-toastify';

const BoxDetails = () => {
    const { id } = useParams();
    const [box, setBox] = useState(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
    const [duration, setDuration] = useState(1);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingData, setBookingData] = useState(null);
    const [error, setError] = useState(null);
    const [bookedSlots, setBookedSlots] = useState([]); // New state for booked time slots
    const [slotsLoading, setSlotsLoading] = useState(false); // Loading state for slots
    const [showReviewModal, setShowReviewModal] = useState(false); // State for review modal
    const [reservationLoading, setReservationLoading] = useState(false);
    const [holdToken, setHoldToken] = useState(null);
    const [reservationSeed, setReservationSeed] = useState(null); // {status, position, expiresAt} from the reserve() HTTP response
    const { boxes } = useBox();
    const { reserveSlot, confirmReservation, releaseHold } = useBooking();
    const { isAuthenticated, user, accessToken } = useAuth();

    const liveReservation = useSlotReservation({
        boxId: box?.id,
        date: selectedTimeSlot ? formatLocalDate(selectedDate) : null,
        startTime: selectedTimeSlot,
        duration,
        holdToken,
        accessToken,
        enabled: showBookingModal && Boolean(reservationSeed),
        initialStatus: reservationSeed?.status,
        initialPosition: reservationSeed?.position,
        initialExpiresAt: reservationSeed?.expiresAt,
    });

    // Check if box is already in favorites on mount or when user/box changes
    useEffect(() => {
        const checkFavorite = async () => {
            if (!user || !box?.id) return;
            try {
                const res = await api.get('/dashboard/favorites/');
                const favs = res.data || [];
                setIsFavorite(favs.some(fav => fav.id === box.id));
            } catch (e) {
                // Ignore error
            }
        };
        checkFavorite();
    }, [user, box?.id]);

    // Shared by the periodic poll below AND by the booking/reservation flows
    // whenever a slot's availability may have just changed (a booking
    // succeeded, a race was lost, someone else's slot was released) — a
    // single source of truth for "what does the grid currently show."
    const refreshBookedSlots = useCallback(async () => {
        if (!box?.id || !selectedDate) return;

        setSlotsLoading(true);
        try {
            const dateString = formatLocalDate(selectedDate); // YYYY-MM-DD in local timezone
            const response = await api.get(`/bookings/booked_slots/?box_id=${box.id}&date=${dateString}`);
            setBookedSlots(response.data.booked_slots || []);
        } catch (error) {
            console.error('Error fetching booked slots:', error);
            setBookedSlots([]); // Reset to empty if error
        } finally {
            setSlotsLoading(false);
        }
    }, [box?.id, selectedDate]);

    // Fetch booked time slots when box or selected date changes
    useEffect(() => {
        refreshBookedSlots();

        // Set up auto-refresh every 30 seconds to keep slots current
        const intervalId = setInterval(refreshBookedSlots, 30000);

        // Cleanup interval on unmount or dependency change
        return () => clearInterval(intervalId);
    }, [refreshBookedSlots]); // Re-fetch when box or date changes

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
        } catch (err) {
            toast.error('Could not add to favorites');
        } finally {
            setFavoriteLoading(false);
        }
    };

    // ...existing code...

    useEffect(() => {
        const fetchBoxDetails = async () => {
            setLoading(true);
            setError(null); // Clear previous errors
            try {
                // Fetch box details from the backend using the imported 'api' (Axios instance)
                const response = await api.get(`/boxes/public/${id}/`); // Updated to use public endpoint
                const fetchedBox = response.data;

                // Ensure rating is a number (backend might send it as string or number)
                if (fetchedBox && typeof fetchedBox.rating === 'string') {
                    fetchedBox.rating = parseFloat(fetchedBox.rating);
                }
                // Default to 0 if rating is null/undefined
                if (fetchedBox && (fetchedBox.rating === undefined || fetchedBox.rating === null)) {
                    fetchedBox.rating = 0;
                }

                setBox(fetchedBox);
            } catch (err) {
                console.error('Error fetching box details:', err);
                setError('Failed to load box details. Please try again later.');
                setBox(null); // Ensure box is null on error
            } finally {
                setLoading(false);
            }
        };

        fetchBoxDetails();
    }, [id]); // Depend only on 'id' as 'boxes' context might not always have full details

    const timeSlots = [
        '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
        '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
        '18:00', '19:00', '20:00', '21:00', '22:00'
    ];

    // Helper function to check if a time slot is available
    const isTimeSlotAvailable = (timeSlot) => {
        if (!timeSlot || bookedSlots.length === 0) return true;
        
        // Check if the selected time slot conflicts with any booked slots
        const selectedHour = parseInt(timeSlot.split(':')[0]);
        
        // Check if the duration of selected slot would conflict with booked slots
        for (let i = 0; i < duration; i++) {
            const checkHour = selectedHour + i;
            const checkTime = `${checkHour.toString().padStart(2, '0')}:00`;
            
            if (bookedSlots.includes(checkTime)) {
                return false;
            }
        }
        
        return true;
    };

    // Helper function to check if a time slot is booked
    const isTimeSlotBooked = (timeSlot) => {
        return bookedSlots.includes(timeSlot);
    };

    const amenityIcons = {
        'Changing Room': Users,
        'Parking': Car,
        'Equipment': Shield,
        'WiFi': Wifi,
        'Refreshments': Coffee,
        'Security': Shield
    };

    // Handle when a new review is added
    const handleReviewAdded = (newReview) => {
        // Add the new review to the box's reviews array
        setBox(prevBox => ({
            ...prevBox,
            reviews: [newReview, ...(prevBox.reviews || [])]
        }));
        
        // Close the review modal
        setShowReviewModal(false);
        
        // Optionally refresh the entire box data to get updated rating
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

    // First phase: reserve the slot (or join its queue) before showing the
    // confirmation modal, so concurrent bookers of the same slot get a real
    // hold/queue-position instead of racing straight for the DB write.
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
            if (result.unavailable) {
                refreshBookedSlots();
            }
            return;
        }

        setHoldToken(result.hold_token);
        setReservationSeed({ status: result.status, position: result.position, expiresAt: result.expires_at });
        setShowBookingModal(true);
        if (result.status === 'queued') {
            toast.info(`This slot is currently held by someone else — you're #${result.position} in the queue.`);
        }
    };

    // Second phase: finalize a held slot into a real booking. The
    // reservation hold is what gates this, not a fresh availability check —
    // the backend's DB-level check remains the final word regardless.
    const handleConfirmReservation = async () => {
        if (!holdToken) return;
        setBookingLoading(true);
        try {
            const result = await confirmReservation(holdToken);
            setShowBookingModal(false);
            setHoldToken(null);
            setReservationSeed(null);
            if (result.success) {
                toast.success('Booking confirmed successfully! 🎉');
                setSelectedTimeSlot('');
                setDuration(1);
                setSelectedDate(new Date());
            } else {
                toast.error(`Booking failed: ${result.error || 'Please try again.'} 🙁`);
            }
            // Refresh either way: a success adds a new booked slot, a
            // failure means someone else's booking is what beat us to it —
            // both cases mean the grid we're showing is now stale.
            refreshBookedSlots();
        } finally {
            setBookingLoading(false);
        }
    };

    // Used both by the modal's "Cancel" button while held (no point paying
    // for the full TTL if the user is walking away) and its "Leave Queue"
    // button while queued.
    const handleGiveUpReservation = async () => {
        const tokenToRelease = holdToken;
        setShowBookingModal(false);
        setHoldToken(null);
        setReservationSeed(null);
        if (tokenToRelease) {
            releaseHold(tokenToRelease); // best-effort — a TTL expiry covers this regardless if it fails
        }
    };

    // Someone else confirmed the slot while we were queued for it.
    useEffect(() => {
        if (liveReservation.status === 'lost') {
            toast.error('This slot was just booked by someone else.');
            setShowBookingModal(false);
            setHoldToken(null);
            setReservationSeed(null);
            refreshBookedSlots();
        }
    }, [liveReservation.status, refreshBookedSlots]);

    // Promoted from the queue into a hold — let the user know it's their turn.
    const wasQueuedRef = useRef(false);
    useEffect(() => {
        if (liveReservation.status === 'queued') {
            wasQueuedRef.current = true;
        } else if (liveReservation.status === 'held' && wasQueuedRef.current) {
            wasQueuedRef.current = false;
            toast.info("It's your turn! Please confirm your booking.");
        }
    }, [liveReservation.status]);


    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors duration-200">
                <Loader text="Loading box details..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors duration-200">
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-gray-700 dark:text-gray-300 mb-6">{error}</p>
                    <Link to="/boxes">
                        <EnhancedButton variant="primary" size="md">
                            Browse Other Boxes
                        </EnhancedButton>
                    </Link>
                </div>
            </div>
        );
    }

    if (!box) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors duration-200">
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Box not found</h2>
                    <p className="text-gray-700 dark:text-gray-300 mb-6">The box you are looking for does not exist or has been removed.</p>
                    <Link to="/boxes">
                        <EnhancedButton variant="primary" size="md">
                            Browse Other Boxes
                        </EnhancedButton>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Header Section with Back Button */}
            <motion.div 
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b dark:border-gray-700 transition-colors duration-200"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="container-max section-padding py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            to="/boxes"
                            className="inline-flex items-center px-3 py-2 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 hover:scale-105 transition-all duration-300"
                        >
                            <ArrowLeft size={18} className="mr-2" />
                            <span className="text-sm font-medium">Back</span>
                        </Link>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Box Details</h2>
                        <div className="w-20"></div> {/* Spacer for centering */}
                    </div>
                </div>
            </motion.div>

            <div className="container-max section-padding py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Image Gallery */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card p-0 overflow-hidden"
                        >
                            <Swiper
                                modules={[Navigation, Pagination, Autoplay]}
                                navigation
                                pagination={{ clickable: true }}
                                autoplay={{ delay: 5000 }}
                                className="h-96"
                            >
                                {box.images?.map((image, index) => (
                                    <SwiperSlide key={index}>
                                        <img
                                            src={image}
                                            alt={`${box.name} - Image ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </SwiperSlide>
                                ))}
                            </Swiper>
                        </motion.div>

                        {/* Box Info */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="card p-6"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{box.name}</h1>
                                    <div className="flex items-center space-x-4 text-gray-600 dark:text-gray-400">
                                        <div className="flex items-center">
                                            <MapPin size={18} className="mr-1" />
                                            <span>{box.location}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <Users size={18} className="mr-1" />
                                            <span>Up to {box.capacity} players</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center mb-2">
                                        <Star size={20} className="text-yellow-500 fill-current mr-1" />
                                        <span className="text-xl font-bold">
                                            {typeof box.rating === 'number' ? box.rating.toFixed(1) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="text-2xl font-bold text-primary-600 mb-4">₹{box.price}/hr</div>
                                    {/* Add to Favorites Button */}
                                    {user && (
                                        <EnhancedButton
                                            onClick={handleAddToFavorites}
                                            variant={isFavorite ? "secondary" : "primary"}
                                            size="sm"
                                            className={`w-full ${isFavorite ? 'bg-green-100 text-green-700 border-green-300' : ''}`}
                                            icon={<Heart size={16} className={isFavorite ? 'fill-current' : ''} />}
                                            loading={favoriteLoading}
                                            disabled={isFavorite}
                                        >
                                            {isFavorite ? 'Added to Favorites' : 'Add to Favorites'}
                                        </EnhancedButton>
                                    )}
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <h3 className="text-lg font-semibold mb-3">Description</h3>
                                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                    {box.fullDescription || box.description}
                                </p>
                            </div>
                        </motion.div>

                        {/* Amenities */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="card p-6"
                        >
                            <h3 className="text-lg font-semibold mb-4">Amenities</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {box.amenities && Array.isArray(box.amenities) ? box.amenities.map((amenity, index) => {
                                    const IconComponent = amenityIcons[amenity] || Shield;
                                    return (
                                        <div key={index} className="flex items-center space-x-2">
                                            <IconComponent size={18} className="text-primary-500" />
                                            <span className="text-gray-700 dark:text-gray-300">{amenity}</span>
                                        </div>
                                    );
                                }) : (
                                    <div className="flex items-center space-x-2">
                                        <Shield size={18} className="text-primary-500" />
                                        <span className="text-gray-700 dark:text-gray-300">No amenities listed</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Rules */}
                        {box.rules && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="card p-6"
                            >
                                <h3 className="text-lg font-semibold mb-4">Rules & Guidelines</h3>
                                <ul className="space-y-2">
                                    {box.rules && Array.isArray(box.rules) ? box.rules.map((rule, index) => (
                                        <li key={index} className="flex items-start">
                                            <span className="text-primary-500 mr-2">•</span>
                                            <span className="text-gray-700 dark:text-gray-300">{rule}</span>
                                        </li>
                                    )) : (
                                        <li className="flex items-start">
                                            <span className="text-primary-500 mr-2">•</span>
                                            <span className="text-gray-700 dark:text-gray-300">
                                                {box.rules || "No specific rules provided"}
                                            </span>
                                        </li>
                                    )}
                                </ul>
                            </motion.div>
                        )}

                        {/* Reviews */}
                        {box.reviews && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="card p-6"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold">Reviews</h3>
                                    {isAuthenticated && (
                                        <EnhancedButton
                                            onClick={() => setShowReviewModal(true)}
                                            variant="primary"
                                            size="sm"
                                            icon={<Star size={16} />}
                                        >
                                            Add Review
                                        </EnhancedButton>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {box.reviews && Array.isArray(box.reviews) && box.reviews.length > 0 ? box.reviews.map((review) => (
                                        <div key={review.id} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium">
                                                        {review.user.charAt(0)}
                                                    </div>
                                                    <span className="font-medium">{review.user}</span>
                                                </div>
                                                <div className="flex items-center">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star
                                                            key={i}
                                                            size={16}
                                                            className={`${
                                                                i < review.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-gray-600 dark:text-gray-400">{review.comment}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{review.date}</p>
                                        </div>
                                    )) : (
                                        <div className="text-center py-8">
                                            <p className="text-gray-500 dark:text-gray-400">No reviews yet. Be the first to review this box!</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Booking Sidebar */}
                    <div className="lg:col-span-1">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className="card p-6 sticky top-8"
                        >
                            <h3 className="text-lg font-semibold mb-4 flex items-center">
                                <CalendarIcon size={20} className="mr-2" />
                                Book This Box
                            </h3>

                            {/* Calendar */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Select Date
                                </label>
                                <Calendar
                                    onChange={setSelectedDate}
                                    value={selectedDate}
                                    minDate={new Date()}
                                    className="w-full"
                                />
                            </div>

                            {/* Time Slots */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Select Time Slot
                                </label>
                                {slotsLoading ? (
                                    <div className="flex items-center justify-center py-4">
                                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Loading available slots...</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                        {timeSlots.map((time) => {
                                            const isBooked = isTimeSlotBooked(time);
                                            const isSelected = selectedTimeSlot === time;
                                            const canSelect = !isBooked && isTimeSlotAvailable(time);
                                            
                                            return (
                                                <button
                                                    key={time}
                                                    onClick={() => canSelect ? setSelectedTimeSlot(time) : null}
                                                    disabled={isBooked || !canSelect}
                                                    className={`p-2 text-sm rounded border transition-all duration-200 ${
                                                        isBooked
                                                            ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 cursor-not-allowed'
                                                            : isSelected
                                                            ? 'bg-primary-500 text-white border-primary-500'
                                                            : canSelect
                                                            ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                                    }`}
                                                    title={isBooked ? 'This time slot is already booked' : canSelect ? 'Available' : 'Not available for selected duration'}
                                                >
                                                    {time}
                                                    {isBooked && (
                                                        <div className="text-xs mt-1 font-medium">Booked</div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                
                                {/* Legend */}
                                <div className="mt-3 flex flex-wrap gap-4 text-xs">
                                    <div className="flex items-center">
                                        <div className="w-3 h-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded mr-2"></div>
                                        <span className="text-gray-600 dark:text-gray-400">Available</span>
                                    </div>
                                    <div className="flex items-center">
                                        <div className="w-3 h-3 bg-primary-500 rounded mr-2"></div>
                                        <span className="text-gray-600 dark:text-gray-400">Selected</span>
                                    </div>
                                    <div className="flex items-center">
                                        <div className="w-3 h-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded mr-2"></div>
                                        <span className="text-gray-600 dark:text-gray-400">Booked</span>
                                    </div>
                                </div>
                            </div>

                            {/* Duration */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Duration (hours)
                                </label>
                                <select
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    {[1, 2, 3, 4, 5, 6].map((hour) => (
                                        <option key={hour} value={hour}>
                                            {hour} hour{hour > 1 ? 's' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Price Summary */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                                <div className="flex justify-between items-center mb-2">
                                    <span>Price per hour:</span>
                                    <span>₹{box.price}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span>Duration:</span>
                                    <span>{duration} hour{duration > 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
                                    <span>Total:</span>
                                    <span className="text-primary-600">₹{box.price * duration}</span>
                                </div>
                            </div>

                            {/* Book Button */}
                            <EnhancedButton
                                onClick={handleBookNowClick}
                                variant="primary"
                                size="lg"
                                className="w-full"
                                disabled={!selectedTimeSlot || reservationLoading}
                                loading={reservationLoading}
                            >
                                {reservationLoading ? 'Checking availability...' : 'Book Now'}
                            </EnhancedButton>

                            <p className="text-xs text-gray-500 mt-2 text-center">
                                Free cancellation up to 2 hours before booking time
                            </p>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Booking Confirmation Modal */}
            <Modal
                isOpen={showBookingModal}
                onClose={handleGiveUpReservation}
                title={liveReservation.status === 'queued' ? "You're in Queue" : "Confirm Booking"}
                size="medium"
            >
                <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">{box.name}</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                            <p>Date: {selectedDate.toLocaleDateString()}</p>
                            <p>Time: {(() => {
                                const startTimeParts = selectedTimeSlot.split(':');
                                const startHour = parseInt(startTimeParts[0]);
                                const startMinute = parseInt(startTimeParts[1]);
                                const endHour = (startHour + duration) % 24;
                                const endMinute = startMinute;
                                return `${selectedTimeSlot} - ${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
                            })()}</p>
                            <p>Duration: {duration} hour{duration > 1 ? 's' : ''}</p>
                            <p className="font-semibold text-lg text-primary-600">
                                Total: ₹{box.price * duration}
                            </p>
                        </div>
                    </div>

                    {liveReservation.status === 'queued' ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                            <p className="text-yellow-800 font-medium">
                                Someone else is currently confirming this slot.
                            </p>
                            <p className="text-yellow-700 text-sm mt-1">
                                You&rsquo;re #{liveReservation.position} in the queue — we&rsquo;ll notify you the moment it&rsquo;s your turn.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-center">
                            <p className="text-primary-800 font-medium">
                                {liveReservation.secondsRemaining != null
                                    ? `Confirm within ${Math.floor(liveReservation.secondsRemaining / 60)}:${String(liveReservation.secondsRemaining % 60).padStart(2, '0')}`
                                    : 'This slot is held for you'}
                            </p>
                            <p className="text-primary-700 text-sm mt-1">
                                If you don&rsquo;t confirm in time, it&rsquo;s released to the next person waiting.
                            </p>
                        </div>
                    )}

                    <div className="flex space-x-3">
                        <EnhancedButton
                            onClick={handleGiveUpReservation}
                            variant="secondary"
                            size="md"
                            className="flex-1"
                        >
                            {liveReservation.status === 'queued' ? 'Leave Queue' : 'Cancel'}
                        </EnhancedButton>
                        {liveReservation.status !== 'queued' && (
                            <EnhancedButton
                                onClick={handleConfirmReservation}
                                variant="primary"
                                size="md"
                                className="flex-1"
                                loading={bookingLoading}
                                disabled={bookingLoading}
                            >
                                Confirm Booking
                            </EnhancedButton>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Add Review Modal */}
            <AddReviewForm
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                boxId={box.id}
                onReviewAdded={handleReviewAdded}
            />

            {/* Chatbot Component */}
            <Chatbot />
        </div>
    );
};

export default BoxDetails;