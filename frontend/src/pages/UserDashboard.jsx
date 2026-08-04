import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, api } from '../api.jsx'; // Import 'api' from your Auth context file
import { useBooking } from '../context/BookingContext';
import { parseBookingDateTime } from '../utils/date';
import { toast } from 'react-toastify';
import {
  Calendar,
  Clock,
  CreditCard,
  Trophy,
  Heart,
  Users,
  CheckCircle,
  XCircle,
  Info,
  TrendingUp,
  Target,
  Activity,
  BarChart3,
  Sparkles,
} from 'lucide-react';

import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement } from 'chart.js';
import {
  EnhancedSportDistribution,
  BookingActivityChart,
  PeakHoursChart,
  MonthlySpendingChart,
} from '../components/common/AdvancedCharts';
import { Button, Card, Badge, Modal, Loader, StatTile, SkeletonLine, SkeletonBlock, SkeletonCircle } from '../components/ui';
import AchievementBadge from '../components/common/Badge';
import GamificationStats from '../components/common/GamificationStats';


// Register Chart.js components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement
);

// Reusable dashboard conventions (Owner/Admin dashboards should copy these
// verbatim rather than inventing new ones) — pill tab bar, StatTile grid,
// bordered/divided list rows.
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'favorites', label: 'Favorites', icon: Heart },
];

const BOOKING_STATUS_TONE = {
  Confirmed: 'success',
  Completed: 'primary',
  Cancelled: 'danger',
};

const UserDashboard = () => {
  const { user, logout } = useAuth();
  const { bookings, loading, error, fetchBookings, cancelBooking } = useBooking();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [userGameStats, setUserGameStats] = useState(null);
  const [favoriteBoxes, setFavoriteBoxes] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [gamificationLoading, setGamificationLoading] = useState(true);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedBookingToCancel, setSelectedBookingToCancel] = useState(null);

  // Fetch Analytics Data (memoized)
  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setAnalyticsLoading(true);
    try {
      const response = await api.get(`/dashboard/analytics/`);
      setAnalyticsData(response.data);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      toast.error('Failed to load analytics data.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user]);

  // Fetch Achievements (memoized)
  const fetchAchievements = useCallback(async () => {
    if (!user) return;
    setAchievementsLoading(true);
    try {
      const response = await api.get(`/dashboard/achievements/`);
      setAchievements(response.data.achievements || response.data || []);
    } catch (err) {
      console.error('Error fetching achievements:', err);
      toast.error('Failed to load achievements.');
    } finally {
      setAchievementsLoading(false);
    }
  }, [user]);

  // Fetch Gamification Stats (memoized)
  const fetchGamificationStats = useCallback(async () => {
    if (!user) return;
    setGamificationLoading(true);
    try {
      const response = await api.get(`/dashboard/user-stats/`);
      // Backend returns { stats: {...}, badges: [...], total_badges }; the
      // GamificationStats component expects a flat { points, badges_earned,
      // total_achievements, weekly_bookings } shape.
      const { stats, total_badges } = response.data;
      setUserGameStats({
        points: stats?.total_points || 0,
        badges_earned: total_badges || 0,
        total_achievements: total_badges || 0,
        weekly_bookings: stats?.weekly_bookings || 0,
      });
    } catch (err) {
      console.error('Error fetching gamification stats:', err);
      // Don't show error toast for this as it's optional feature
    } finally {
      setGamificationLoading(false);
    }
  }, [user]);

  // Fetch Favorite Boxes (memoized)
  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    setFavoritesLoading(true);
    try {
      const response = await api.get(`/dashboard/favorites/`);
      setFavoriteBoxes(response.data);
    } catch (err) {
      console.error('Error fetching favorite boxes:', err);
      toast.error('Failed to load favorite boxes.');
    } finally {
      setFavoritesLoading(false);
    }
  }, [user]);

  const removeFavorite = useCallback(async (boxId) => {
    if (!user) return;

    try {
      await api.delete(`/dashboard/favorites/${boxId}/remove/`);
      toast.success('Box removed from favorites successfully!');
      // Refresh the favorites list
      fetchFavorites();
    } catch (err) {
      console.error('Error removing favorite:', err);
      toast.error('Failed to remove box from favorites.');
    }
  }, [user, fetchFavorites]);


  // useEffect to call all dashboard data fetches
  useEffect(() => {
    if (user && user.id) {
      fetchBookings(user.id);
      fetchAnalytics();
      fetchAchievements();
      fetchGamificationStats();
      fetchFavorites();
    }
  }, [user, fetchBookings, fetchAnalytics, fetchAchievements, fetchGamificationStats, fetchFavorites]);

  // useEffect for handling favorite-added event
  useEffect(() => {
    const handler = () => fetchFavorites();
    window.addEventListener('favorite-added', handler);
    return () => window.removeEventListener('favorite-added', handler);
  }, [fetchFavorites]);


  // Handle Logout
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Open Cancel Modal
  const openCancelModal = (booking) => {
    setSelectedBookingToCancel(booking);
    setIsCancelModalOpen(true);
  };

  // Close Cancel Modal
  const closeCancelModal = () => {
    setIsCancelModalOpen(false);
    setSelectedBookingToCancel(null);
  };

  // Confirm Cancellation
  const confirmCancelBooking = async () => {
    if (selectedBookingToCancel) {
      const { success } = await cancelBooking(selectedBookingToCancel.id);
      if (success) {
        toast.success('Booking cancelled successfully!');
        if (user && user.id) {
          fetchBookings(user.id); // Re-fetch bookings
          fetchAnalytics(); // Re-fetch analytics to update spent
        }
      } else {
        toast.error('Failed to cancel booking.');
      }
      closeCancelModal();
    }
  };


  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-xl text-muted-foreground">Please log in to view your dashboard.</p>
      </div>
    );
  }

  // Filter bookings for upcoming (bookings with an unparseable date/time are
  // excluded from both lists rather than sorting unpredictably)
  const upcomingBookings = bookings.filter(b => {
    const bookingDateTime = parseBookingDateTime(b.date, b.start_time);
    return bookingDateTime && bookingDateTime > new Date();
  }).sort((a, b) => parseBookingDateTime(a.date, a.start_time) - parseBookingDateTime(b.date, b.start_time));

  // Filter bookings for past bookings
  const pastBookings = bookings.filter(b => {
    const bookingDateTime = parseBookingDateTime(b.date, b.start_time);
    return bookingDateTime && bookingDateTime <= new Date();
  }).sort((a, b) => parseBookingDateTime(b.date, b.start_time) - parseBookingDateTime(a.date, a.start_time));

  return (
    <div className="min-h-screen bg-background pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header panel */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl bg-card border border-border text-foreground p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Users size={28} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Welcome back, {user.first_name || user.username?.split('@')[0] || 'Champion'}
              </h1>
              <p className="mt-1.5 text-muted-foreground flex items-center gap-2 text-sm sm:text-base">
                <Sparkles size={16} />
                {user.email}
              </p>
            </div>
          </div>

          <Button onClick={handleLogout} variant="outline" className="shrink-0">
            Logout
          </Button>
        </motion.div>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2 mt-6 overflow-x-auto no-scrollbar" aria-label="Tabs">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-2.5 px-4 rounded-full font-medium text-sm border transition-colors duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-elevated'
                }`}
              >
                <TabIcon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab Content */}
        <div className="py-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatTile
                  tone="primary"
                  icon={<Calendar size={22} />}
                  value={bookings.length}
                  label="Total bookings"
                  loading={loading}
                />
                <StatTile
                  tone="success"
                  icon={<Clock size={22} />}
                  value={analyticsData?.this_month_bookings || 0}
                  label="This month's bookings"
                  loading={analyticsLoading}
                />
                <StatTile
                  tone="secondary"
                  icon={<CreditCard size={22} />}
                  value={`₹${(analyticsData?.total_spent || 0).toFixed(2)}`}
                  label="Total spent"
                  loading={analyticsLoading}
                />
                <StatTile
                  tone="neutral"
                  icon={<Heart size={22} />}
                  value={favoriteBoxes.length || 0}
                  label="Favorite boxes"
                  loading={favoritesLoading}
                />
              </div>

              {/* Recent Activity & Gamification Overview */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                <Card padding="md" className="xl:col-span-2">
                  <h3 className="text-lg font-display font-semibold mb-4 text-foreground">Recent activity</h3>
                  {loading ? (
                    <Loader text="Loading recent activity..." className="py-6" />
                  ) : bookings.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground bg-elevated rounded-lg">
                      <p>No recent activity. <button onClick={() => navigate('/boxes')} className="text-primary font-medium hover:underline">Book a session!</button></p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                      {bookings.slice(0, 4).map((booking) => (
                        <div key={booking.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 sm:gap-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-medium text-lg shrink-0">
                              {(booking.box?.sport || booking.box_sport)?.charAt(0).toUpperCase() ?? 'S'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground truncate">{booking.box?.name || booking.box_name || 'Unknown Box'}</p>
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                {new Date(booking.date).toLocaleDateString()} &bull; {booking.start_time} - {booking.end_time}
                              </p>
                            </div>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-1">
                            <span className="text-primary font-medium tabular-nums">₹{booking.total_amount}</span>
                            <Badge tone={BOOKING_STATUS_TONE[booking.booking_status] || 'neutral'}>{booking.booking_status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card padding="md">
                  <h3 className="text-base sm:text-lg font-display font-semibold mb-4 text-foreground flex items-center">
                    <Trophy className="mr-2 text-warning" size={20} />
                    Your Level
                  </h3>
                  {gamificationLoading ? (
                    <Loader className="py-6" />
                  ) : userGameStats ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="w-20 h-20 mx-auto bg-primary rounded-full flex items-center justify-center text-primary-foreground font-display text-xl mb-2">
                          {userGameStats.points >= 1000 ? '5' :
                           userGameStats.points >= 500 ? '4' :
                           userGameStats.points >= 200 ? '3' :
                           userGameStats.points >= 50 ? '2' : '1'}
                        </div>
                        <h4 className="font-display font-semibold text-foreground">
                          {userGameStats.points >= 1000 ? 'Sports Legend' :
                           userGameStats.points >= 500 ? 'Sports Master' :
                           userGameStats.points >= 200 ? 'Sports Expert' :
                           userGameStats.points >= 50 ? 'Sports Enthusiast' : 'Beginner'}
                        </h4>
                        <p className="text-sm text-muted-foreground">{userGameStats.points} points</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Badges</span>
                          <span className="font-medium text-foreground">{userGameStats.badges_earned || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">This Week</span>
                          <span className="font-medium text-foreground">{userGameStats.weekly_bookings || 0}/3</span>
                        </div>
                      </div>

                      <Button onClick={() => setActiveTab('achievements')} size="sm" fullWidth>
                        View All Achievements
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Start booking to begin your journey!</p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* My Bookings Tab */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-semibold text-foreground mb-4">My Bookings</h2>

              {loading ? (
                <Loader text="Loading your bookings..." className="py-10" />
              ) : error ? (
                <div className="text-center py-10 text-danger">Error: {error}</div>
              ) : bookings.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <p className="text-lg text-muted-foreground mb-4">You don&apos;t have any bookings yet.</p>
                  <Button onClick={() => navigate('/boxes')} size="lg">
                    Find a Box and Book Now!
                  </Button>
                </Card>
              ) : (
                <>
                  <Card padding="md">
                    <h3 className="text-xl font-display font-semibold text-foreground mb-4 flex items-center">
                      <CheckCircle size={22} className="mr-2 text-success" />
                      Upcoming Bookings ({upcomingBookings.length})
                    </h3>
                    {upcomingBookings.length === 0 ? (
                      <p className="text-muted-foreground">No upcoming bookings.</p>
                    ) : (
                      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                        {upcomingBookings.map((booking) => (
                          <div key={booking.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <p className="font-semibold text-lg text-foreground">{booking.box?.name || booking.box_name || 'Unknown Box'}</p>
                              <p className="text-muted-foreground">
                                {new Date(booking.date).toLocaleDateString()} at {booking.start_time} - {booking.end_time} ({booking.duration} hr)
                              </p>
                              <p className="text-muted-foreground tabular-nums">Total: ₹{booking.total_amount}</p>
                            </div>
                            <div>
                              {booking.booking_status === 'Confirmed' ? (
                                <Button variant="danger" size="sm" icon={<XCircle size={18} />} onClick={() => openCancelModal(booking)}>
                                  Cancel Booking
                                </Button>
                              ) : (
                                <Badge tone={BOOKING_STATUS_TONE[booking.booking_status] || 'neutral'} size="md">
                                  {booking.booking_status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card padding="md">
                    <h3 className="text-xl font-display font-semibold text-foreground mb-4 flex items-center">
                      <Clock size={22} className="mr-2 text-muted-foreground" />
                      Past Bookings ({pastBookings.length})
                    </h3>
                    {pastBookings.length === 0 ? (
                      <p className="text-muted-foreground">No past bookings.</p>
                    ) : (
                      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                        {pastBookings.map((booking) => (
                          <div key={booking.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <p className="font-semibold text-lg text-foreground">{booking.box?.name || booking.box_name || 'Unknown Box'}</p>
                              <p className="text-muted-foreground">
                                {new Date(booking.date).toLocaleDateString()} at {booking.start_time} - {booking.end_time} ({booking.duration} hr)
                              </p>
                              <p className="text-muted-foreground tabular-nums">Total: ₹{booking.total_amount}</p>
                            </div>
                            <Badge tone={BOOKING_STATUS_TONE[booking.booking_status] || 'neutral'} size="md">
                              {booking.booking_status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 size={26} className="text-primary" />
                <h2 className="text-2xl font-display font-semibold text-foreground">
                  Your Performance &amp; Activity Analytics
                </h2>
              </div>

              {analyticsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i} padding="md" className="space-y-3">
                      <SkeletonLine width="w-24" />
                      <SkeletonBlock className="h-8 w-full" />
                    </Card>
                  ))}
                </div>
              ) : !analyticsData ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Activity size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No analytics data available.</p>
                </div>
              ) : (
                <>
                  {/* Stat Tiles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatTile
                      tone="primary"
                      icon={<Clock size={22} />}
                      value={<>{(analyticsData?.total_hours_played ?? 0).toFixed(1)}<span className="text-lg ml-1">hrs</span></>}
                      label="Total hours played"
                    />
                    <StatTile
                      tone="warning"
                      icon={<Trophy size={22} />}
                      value={`${(analyticsData?.average_rating ?? 0).toFixed(1)} / 5`}
                      label="Average rating"
                    />
                    <StatTile
                      tone="secondary"
                      icon={<CreditCard size={22} />}
                      value={`₹${(analyticsData?.average_cost_per_session ?? 0).toFixed(0)}`}
                      label="Avg cost / session"
                    />
                    <StatTile
                      tone="danger"
                      icon={<Target size={22} />}
                      value={`${(analyticsData?.cancellation_rate ?? 0).toFixed(1)}%`}
                      label="Cancellation rate"
                    />
                  </div>

                  {/* Charts Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Monthly Spending Trend */}
                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={20} className="text-primary" />
                        <h3 className="text-lg font-display font-semibold text-foreground">
                          Monthly Spending Trend
                        </h3>
                      </div>
                      <MonthlySpendingChart
                        data={{
                          labels: analyticsData?.monthly_spending?.map(item => item.month) || [],
                          values: analyticsData?.monthly_spending?.map(item => item.total_spent) || [],
                        }}
                        loading={analyticsLoading}
                      />
                      <div className="mt-3 text-sm text-muted-foreground">
                        Track your investment in sports activities over time
                      </div>
                    </Card>

                    {/* Sport Distribution */}
                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <Activity size={20} className="text-success" />
                        <h3 className="text-lg font-display font-semibold text-foreground">
                          Favorite Sports
                        </h3>
                      </div>
                      <EnhancedSportDistribution
                        data={{
                          labels: analyticsData?.sport_distribution?.map(item => item.sport) || [],
                          values: analyticsData?.sport_distribution?.map(item => item.percentage) || [],
                        }}
                        loading={analyticsLoading}
                      />
                      <div className="mt-3 text-sm text-muted-foreground">
                        Your sports preferences based on booking history
                      </div>
                    </Card>

                    {/* Activity by Day */}
                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <Calendar size={20} className="text-primary" />
                        <h3 className="text-lg font-display font-semibold text-foreground">
                          Weekly Activity Pattern
                        </h3>
                      </div>
                      <BookingActivityChart
                        data={{
                          labels: analyticsData?.activity_by_day?.map(item => item.day_of_week) || [],
                          values: analyticsData?.activity_by_day?.map(item => item.total_hours) || [],
                        }}
                        loading={analyticsLoading}
                      />
                      <div className="mt-3 text-sm text-muted-foreground">
                        When you&apos;re most active during the week
                      </div>
                    </Card>

                    {/* Peak Booking Hours */}
                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock size={20} className="text-turf" />
                        <h3 className="text-lg font-display font-semibold text-foreground">
                          Peak Booking Hours
                        </h3>
                      </div>
                      <PeakHoursChart
                        data={{
                          labels: analyticsData?.peak_booking_hours?.map(item => item.hour_range) || [],
                          values: analyticsData?.peak_booking_hours?.map(item => item.percentage) || [],
                        }}
                        loading={analyticsLoading}
                      />
                      <div className="mt-3 text-sm text-muted-foreground">
                        Your preferred time slots for sports activities
                      </div>
                    </Card>
                  </div>

                  {/* Insights Section */}
                  <Card padding="md" variant="outlined">
                    <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center">
                      <Info size={20} className="mr-2 text-primary" />
                      Your Sports Insights
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="bg-elevated p-4 rounded-lg">
                        <p className="font-medium text-foreground">Most Active Sport</p>
                        <p className="text-primary">
                          {analyticsData?.sport_distribution?.[0]?.sport || 'N/A'}
                        </p>
                      </div>
                      <div className="bg-elevated p-4 rounded-lg">
                        <p className="font-medium text-foreground">Total Investment</p>
                        <p className="text-success">
                          ₹{(analyticsData?.total_spent || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-elevated p-4 rounded-lg">
                        <p className="font-medium text-foreground">This Month</p>
                        <p className="text-turf">
                          {analyticsData?.this_month_bookings || 0} bookings
                        </p>
                      </div>
                      <div className="bg-elevated p-4 rounded-lg">
                        <p className="font-medium text-foreground">Consistency Score</p>
                        <p className="text-warning">
                          {analyticsData?.cancellation_rate < 10 ? 'Excellent' :
                           analyticsData?.cancellation_rate < 25 ? 'Good' : 'Needs Improvement'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Achievements Tab */}
          {activeTab === 'achievements' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={26} className="text-warning" />
                <h2 className="text-2xl font-display font-semibold text-foreground">
                  Your Gaming Progress &amp; Achievements
                </h2>
              </div>

              {/* Gamification Stats */}
              <div className="mb-8">
                <h3 className="text-xl font-display font-semibold text-foreground mb-4 flex items-center">
                  <Sparkles className="mr-2 text-primary" size={20} />
                  Your Sports Journey
                </h3>
                <GamificationStats userStats={userGameStats} loading={gamificationLoading} />
              </div>

              {/* Achievements Grid */}
              <div>
                <h3 className="text-xl font-display font-semibold text-foreground mb-4 flex items-center">
                  <Trophy className="mr-2 text-warning" size={20} />
                  Achievement Badges
                </h3>

                {achievementsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                      <Card key={i} padding="md" className="flex flex-col items-center">
                        <SkeletonCircle size="w-16 h-16" className="mb-4" />
                        <SkeletonLine width="w-20" className="mb-2" />
                        <SkeletonLine width="w-16" />
                      </Card>
                    ))}
                  </div>
                ) : !Array.isArray(achievements) || achievements.length === 0 ? (
                  <Card padding="lg" className="text-center">
                    <Trophy size={56} className="mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg text-muted-foreground mb-2">No achievements unlocked yet!</p>
                    <p className="text-muted-foreground">Keep booking sessions to earn your first badge.</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {achievements.filter(Boolean).map((achievement, idx) => {
                      // Determine badge type based on achievement name
                      let badgeType = 'default';
                      const name = achievement?.name?.toLowerCase() || '';
                      if (name.includes('first') || name.includes('timer')) badgeType = 'bronze';
                      else if (name.includes('weekly') || name.includes('warrior')) badgeType = 'silver';
                      else if (name.includes('regular') || name.includes('player')) badgeType = 'gold';
                      else if (name.includes('sports') || name.includes('enthusiast')) badgeType = 'platinum';
                      else if (name.includes('spender') || name.includes('big')) badgeType = 'gold';
                      else if (name.includes('monthly') || name.includes('champion')) badgeType = 'platinum';

                      return (
                        <AchievementBadge
                          key={achievement?.id || achievement?.name || idx}
                          name={achievement?.name || 'Achievement'}
                          description={achievement?.description || ''}
                          earned={achievement?.earned || false}
                          type={badgeType}
                          size="md"
                        />
                      );
                    })}
                  </div>
                )}

                {/* Achievement Progress */}
                {achievements.length > 0 && (
                  <Card padding="md" className="mt-8">
                    <h4 className="text-lg font-display font-semibold mb-4 flex items-center text-foreground">
                      <TrendingUp className="mr-2 text-success" size={20} />
                      Progress Summary
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="font-display text-3xl text-success tabular-nums">
                          {achievements.filter(a => a?.earned).length}
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">Badges Earned</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display text-3xl text-primary tabular-nums">
                          {achievements.length}
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">Total Available</div>
                      </div>
                      <div className="text-center">
                        <div className="font-display text-3xl text-turf tabular-nums">
                          {achievements.length > 0 ? Math.round((achievements.filter(a => a?.earned).length / achievements.length) * 100) : 0}%
                        </div>
                        <div className="text-muted-foreground text-sm mt-1">Completion Rate</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-6">
                      <div className="flex justify-between text-sm text-muted-foreground mb-2">
                        <span>Achievement Progress</span>
                        <span>{achievements.filter(a => a?.earned).length} / {achievements.length}</span>
                      </div>
                      <div className="w-full bg-elevated rounded-full h-2.5">
                        <div
                          className="bg-primary h-2.5 rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${achievements.length > 0 ? (achievements.filter(a => a?.earned).length / achievements.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Favorites Tab */}
          {activeTab === 'favorites' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-semibold text-foreground mb-4">Your Favorite Boxes</h2>
              {favoritesLoading ? (
                <Loader text="Loading your favorite boxes..." className="py-10" />
              ) : !Array.isArray(favoriteBoxes) || favoriteBoxes.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <p className="text-muted-foreground">No favorite boxes added yet. Click the heart icon on box pages to save them!</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {favoriteBoxes.filter(Boolean).map((fav) => {
                    // Use flat structure as per backend response
                    return (
                      <Card key={fav.id} padding="md" interactive className="flex flex-col justify-between">
                        <div>
                          <h3 className="text-xl font-display font-semibold text-foreground">{fav.name}</h3>
                          <p className="text-muted-foreground text-sm mt-1">{fav.location}</p>
                          <p className="text-primary font-medium text-lg mt-2 tabular-nums">₹{fav.price_per_hour} / hour</p>
                          <p className="text-muted-foreground text-sm mt-2">{fav.description}</p>
                          {fav.added_on && (
                            <p className="text-muted-foreground text-xs mt-2">Added on: {new Date(fav.added_on).toLocaleDateString()}</p>
                          )}
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button variant="primary" size="sm" fullWidth onClick={() => navigate(`/boxes/${fav.id}`)}>
                            View Box
                          </Button>
                          <Button variant="danger" size="sm" fullWidth onClick={() => removeFavorite(fav.id)}>
                            Remove
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal — Modal already manages its own isOpen-driven
          AnimatePresence internally; gating it with an outer conditional here
          would unmount it before its exit animation can run. */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={closeCancelModal}
        title="Confirm Cancellation"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={closeCancelModal}>Keep Booking</Button>
            <Button variant="danger" onClick={confirmCancelBooking}>Confirm Cancel</Button>
          </>
        )}
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to cancel your booking for{' '}
          <span className="font-semibold text-foreground">{selectedBookingToCancel?.box?.name}</span> on{' '}
          <span className="font-semibold text-foreground">
            {selectedBookingToCancel?.date ? new Date(selectedBookingToCancel.date).toLocaleDateString() : ''}
          </span>{' '}
          at <span className="font-semibold text-foreground">{selectedBookingToCancel?.start_time}</span>?
        </p>
        <p className="text-xs text-warning mt-2">
          Please note: Cancellations made within 2 hours of the booking time are not allowed.
          (This policy is handled by the backend.)
        </p>
      </Modal>
    </div>
  );
};

export default UserDashboard;
