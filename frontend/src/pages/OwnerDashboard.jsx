// OwnerDashboard.jsx

import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Edit, Eye, TrendingUp, Calendar, DollarSign, Star, Clock, BarChart3,
  AlertCircle, CheckCircle, Activity, Sparkles, Building, Search, XCircle, Trash2, Wallet, CalendarOff, X, Zap, Gift, ShieldCheck, UserX,
} from 'lucide-react';
import { toast } from 'react-toastify';

import AddBoxForm from '../components/boxes/AddBoxForm';
import ViewBoxModal from '../components/boxes/ViewBoxModal';
import OwnerRewardsTab from '../components/rewards/OwnerRewardsTab';
import OwnerVerificationTab from '../components/verification/OwnerVerificationTab';
import OwnerPayoutDetailsCard from '../components/payouts/OwnerPayoutDetailsCard';
import { OwnerScheduleCard } from '../components/bookings/OwnerScheduleCard';
import { OwnerScheduleTab } from '../components/bookings/OwnerScheduleTab';
import { useAuth, api, MEDIA_BASE_URL } from '../api.jsx';
import { useBox } from '../context/BoxContext';
import { Button, Card, Badge, Loader, StatTile, Input, Select, Modal, Pagination } from '../components/ui';
import { PeakHoursChart } from '../components/common/AdvancedCharts';
import { useDebounce } from '../hooks/useDebounce';

const BOOKINGS_PAGE_SIZE = 20
const PAYOUTS_PAGE_SIZE = 20

// Matches Payout.PAYMENT_METHOD_CHOICES (owner_dashboard/models.py). Rows
// recorded before this field existed have payment_method === '' and fall
// back to '—' wherever this map is consulted.
const PAYMENT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cash: 'Cash',
  other: 'Other',
}

const FALLBACK_BOX_IMAGE = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200&q=80';

// Reusable dashboard conventions, copied verbatim from UserDashboard.jsx (see
// that file's comments) rather than reinvented.
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'boxes', label: 'My Boxes', icon: Building },
  { id: 'schedule', label: 'Box Schedule', icon: Clock },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'rewards', label: 'Rewards', icon: Gift },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
];

const BOX_STATUS_TONE = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  changes_requested: 'warning',
};

/** Empty/placeholder state for sections that have no data yet. */
function Placeholder({ text, icon: Icon = AlertCircle }) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      <Icon size={40} className="mx-auto mb-3 opacity-50" />
      <p>{text}</p>
    </div>
  );
}

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddBoxModal, setShowAddBoxModal] = useState(false);
  const [showEditBoxModal, setShowEditBoxModal] = useState(false);
  const [showViewBoxModal, setShowViewBoxModal] = useState(false);
  const [selectedBox, setSelectedBox] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Bookings tab: its own paginated/filtered fetch against
  // /owner_dashboard/bookings/ (bookings on this owner's boxes), separate
  // from the Overview tab's hard-capped top-5 recent_bookings slice.
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('');
  const [bookingBoxFilter, setBookingBoxFilter] = useState('');
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsResult, setBookingsResult] = useState({ results: [], count: 0 });
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [noShowBooking, setNoShowBooking] = useState(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);

  const [boxToDelete, setBoxToDelete] = useState(null);
  const [deletingBox, setDeletingBox] = useState(false);

  // Blocked-dates modal: whole-day holiday/maintenance blocks per box,
  // opened from a box card's "Manage blocked dates" button.
  const [blockedDatesBox, setBlockedDatesBox] = useState(null);
  const [blockedDates, setBlockedDates] = useState([]);
  const [blockedDatesLoading, setBlockedDatesLoading] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('');
  const [addingBlockedDate, setAddingBlockedDate] = useState(false);
  // Set when a plain block attempt is rejected because the date already has
  // Confirmed bookings on it — holds the { detail, conflicting_bookings }
  // payload so the owner can see exactly what would be cancelled before
  // opting into force=true.
  const [blockConflict, setBlockConflict] = useState(null);
  const [forcingBlockedDate, setForcingBlockedDate] = useState(false);

  // Pricing-rules modal: peak/off-peak price overrides per box, opened from
  // a box card's "Manage pricing" button. Same shape as the blocked-dates
  // modal above — a box needs a real id to own child rows, so this can't
  // live in the (new-box) AddBoxForm wizard.
  const [pricingRulesBox, setPricingRulesBox] = useState(null);
  const [pricingRules, setPricingRules] = useState([]);
  const [pricingRulesLoading, setPricingRulesLoading] = useState(false);
  const [newRule, setNewRule] = useState({ applies_to: 'weekend', start_time: '18:00', end_time: '22:00', price: '', label: '' });
  const [addingRule, setAddingRule] = useState(false);

  // Owner-priority manual/walk-in booking — lets the owner claim a slot on
  // their own box directly (POST /owner_dashboard/bookings/book/), which
  // preempts any customer currently holding or queued for that exact slot.
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [addBookingForm, setAddBookingForm] = useState({
    boxId: '', date: '', startTime: '', duration: 1, customerName: '', customerPhone: '', paymentStatus: 'Not Required',
  });
  const [addingBooking, setAddingBooking] = useState(false);

  // Payouts tab: own balance summary + payout history.
  const [payoutBalance, setPayoutBalance] = useState(null);
  const [payoutBalanceLoading, setPayoutBalanceLoading] = useState(false);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [payoutsResult, setPayoutsResult] = useState({ results: [], count: 0 });
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [paySchedule, setPaySchedule] = useState(null);

  const { user } = useAuth();
  const { refreshAll, deleteBox } = useBox();
  const debouncedBookingSearch = useDebounce(bookingSearch, 300);

  // Fetch all dashboard data
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/owner_dashboard/stats/');
      setDashboardData(response.data);
    } catch {
      setError("Failed to fetch dashboard data. Please try again later.");
      setDashboardData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchAllData();
    }
  }, [user?.id, fetchAllData]);

  // Deeper analytics (occupancy, peak hours, per-box ranking) — fetched
  // lazily the first time the Analytics tab is opened rather than on every
  // dashboard load, since it's a separate, heavier query than the Overview
  // tab's stats.
  useEffect(() => {
    if (activeTab !== 'analytics' || analyticsData || analyticsLoading) return;
    setAnalyticsLoading(true);
    api.get('/owner_dashboard/analytics/')
      .then((res) => setAnalyticsData(res.data))
      .catch(() => setAnalyticsData(null))
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, analyticsData, analyticsLoading]);

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const params = new URLSearchParams({ page: bookingsPage, page_size: BOOKINGS_PAGE_SIZE });
      if (debouncedBookingSearch) params.set('search', debouncedBookingSearch);
      if (bookingStatusFilter) params.set('status', bookingStatusFilter);
      if (bookingBoxFilter) params.set('box', bookingBoxFilter);
      const response = await api.get(`/owner_dashboard/bookings/?${params.toString()}`);
      setBookingsResult({ results: response.data.results, count: response.data.count });
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setBookingsLoading(false);
    }
  }, [bookingsPage, debouncedBookingSearch, bookingStatusFilter, bookingBoxFilter]);

  useEffect(() => {
    if (activeTab === 'bookings') fetchBookings();
  }, [activeTab, fetchBookings]);

  useEffect(() => {
    setBookingsPage(1);
  }, [debouncedBookingSearch, bookingStatusFilter, bookingBoxFilter]);

  const fetchPayoutBalance = useCallback(async () => {
    setPayoutBalanceLoading(true);
    try {
      const response = await api.get('/owner_dashboard/payouts/balance/');
      setPayoutBalance(response.data);
    } catch {
      setPayoutBalance(null);
    } finally {
      setPayoutBalanceLoading(false);
    }
  }, []);

  const fetchPayouts = useCallback(async () => {
    setPayoutsLoading(true);
    try {
      const params = new URLSearchParams({ page: payoutsPage, page_size: PAYOUTS_PAGE_SIZE });
      const response = await api.get(`/owner_dashboard/payouts/?${params.toString()}`);
      setPayoutsResult({ results: response.data.results, count: response.data.count });
    } catch {
      toast.error('Failed to load payout history');
    } finally {
      setPayoutsLoading(false);
    }
  }, [payoutsPage]);

  const fetchPaySchedule = useCallback(async () => {
    try {
      const response = await api.get('/owner_dashboard/payout-schedules/');
      const list = response.data.results || response.data;
      setPaySchedule(list[0] || null);
    } catch {
      setPaySchedule(null);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'payouts') {
      fetchPayoutBalance();
      fetchPayouts();
      fetchPaySchedule();
    }
  }, [activeTab, fetchPayoutBalance, fetchPayouts, fetchPaySchedule]);

  const openCancelModal = (booking) => {
    setCancellingBooking(booking);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancellingBooking || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await api.post(`/owner_dashboard/bookings/${cancellingBooking.id}/cancel/`, { reason: cancelReason.trim() });
      toast.success('Booking cancelled');
      setCancellingBooking(null);
      setCancelReason('');
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmNoShow = async () => {
    if (!noShowBooking) return;
    setMarkingNoShow(true);
    try {
      await api.post(`/owner_dashboard/bookings/${noShowBooking.id}/mark-no-show/`);
      toast.success('Booking marked as a no-show — no refund applies.');
      setNoShowBooking(null);
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to mark as no-show');
    } finally {
      setMarkingNoShow(false);
    }
  };

  // `prefill` lets the new Overview schedule panel jump straight to "create
  // a booking for this exact free slot" instead of the owner re-picking the
  // box/date/time it was already showing them.
  const openAddBookingModal = (prefill = {}) => {
    setAddBookingForm({
      boxId: all_owner_boxes.find((b) => b.status === 'approved')?.id || '',
      date: '', startTime: '', duration: 1, customerName: '', customerPhone: '', paymentStatus: 'Not Required',
      ...prefill,
    });
    setShowAddBookingModal(true);
  };

  const handleAddBookingSubmit = async () => {
    const { boxId, date, startTime, duration, customerName, customerPhone, paymentStatus } = addBookingForm;
    if (!boxId || !date || !startTime) {
      toast.error('Box, date, and start time are required.');
      return;
    }
    setAddingBooking(true);
    try {
      await api.post('/owner_dashboard/bookings/book/', {
        boxId, date, startTime, duration, customerName, customerPhone, paymentStatus,
      });
      toast.success('Booking created — any customer hold on this slot has been released.');
      setShowAddBookingModal(false);
      fetchBookings();
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create booking');
    } finally {
      setAddingBooking(false);
    }
  };

  // Success handler for the AddBoxForm
  const handleAddBoxSuccess = () => {
    setShowAddBoxModal(false);
    fetchAllData();
    refreshAll();
  };

  // Success handler for the EditBoxForm
  const handleEditBoxSuccess = () => {
    setShowEditBoxModal(false);
    setSelectedBox(null);
    fetchAllData();
    refreshAll();
  };

  const handleViewBox = (box) => {
    setSelectedBox(box);
    setShowViewBoxModal(true);
  };

  const handleEditBox = (box) => {
    setSelectedBox(box);
    setShowEditBoxModal(true);
  };

  const openBlockedDatesModal = async (box) => {
    setBlockedDatesBox(box);
    setNewBlockedDate('');
    setNewBlockedReason('');
    setBlockConflict(null);
    setBlockedDatesLoading(true);
    try {
      const response = await api.get('/boxes/blocked-dates/', { params: { box: box.id } });
      setBlockedDates(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching blocked dates:', err);
      toast.error('Failed to load blocked dates.');
    } finally {
      setBlockedDatesLoading(false);
    }
  };

  const closeBlockedDatesModal = () => {
    setBlockedDatesBox(null);
    setBlockedDates([]);
    setBlockConflict(null);
  };

  const handleAddBlockedDate = async () => {
    if (!newBlockedDate) {
      toast.error('Please pick a date to block.');
      return;
    }
    setBlockConflict(null);
    setAddingBlockedDate(true);
    try {
      const response = await api.post('/boxes/blocked-dates/', {
        box: blockedDatesBox.id, date: newBlockedDate, reason: newBlockedReason.trim(),
      });
      setBlockedDates((prev) => [...prev, response.data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockedDate('');
      setNewBlockedReason('');
      toast.success(response.data.detail || 'Date blocked.');
    } catch (err) {
      const data = err.response?.data;
      // A 400 carrying conflicting_bookings means there are Confirmed
      // bookings on this date — surface them instead of a bare toast so the
      // owner can make an informed force=true decision.
      if (err.response?.status === 400 && data?.conflicting_bookings?.length) {
        setBlockConflict(data);
      } else {
        toast.error(data?.detail || 'Failed to block this date.');
      }
    } finally {
      setAddingBlockedDate(false);
    }
  };

  const handleForceBlockedDate = async () => {
    if (!blockedDatesBox || !newBlockedDate) return;
    setForcingBlockedDate(true);
    try {
      const response = await api.post('/boxes/blocked-dates/', {
        box: blockedDatesBox.id, date: newBlockedDate, reason: newBlockedReason.trim(), force: true,
      });
      setBlockedDates((prev) => [...prev, response.data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockedDate('');
      setNewBlockedReason('');
      setBlockConflict(null);
      toast.success(response.data.detail || 'Date blocked.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to block this date.');
    } finally {
      setForcingBlockedDate(false);
    }
  };

  const handleRemoveBlockedDate = async (id) => {
    try {
      await api.delete(`/boxes/blocked-dates/${id}/`);
      setBlockedDates((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove this block.');
    }
  };

  const openPricingRulesModal = async (box) => {
    setPricingRulesBox(box);
    setNewRule({ applies_to: 'weekend', start_time: '18:00', end_time: '22:00', price: '', label: '' });
    setPricingRulesLoading(true);
    try {
      const response = await api.get('/boxes/pricing-rules/', { params: { box: box.id } });
      setPricingRules(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching pricing rules:', err);
      toast.error('Failed to load pricing rules.');
    } finally {
      setPricingRulesLoading(false);
    }
  };

  const closePricingRulesModal = () => {
    setPricingRulesBox(null);
    setPricingRules([]);
  };

  const handleAddPricingRule = async () => {
    if (!newRule.price || Number(newRule.price) <= 0) {
      toast.error('Please enter a valid price.');
      return;
    }
    setAddingRule(true);
    try {
      const response = await api.post('/boxes/pricing-rules/', { box: pricingRulesBox.id, ...newRule });
      setPricingRules((prev) => [...prev, response.data]);
      setNewRule({ applies_to: 'weekend', start_time: '18:00', end_time: '22:00', price: '', label: '' });
      toast.success('Pricing rule added.');
    } catch (err) {
      toast.error(err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || 'Failed to add this rule.');
    } finally {
      setAddingRule(false);
    }
  };

  const handleRemovePricingRule = async (id) => {
    try {
      await api.delete(`/boxes/pricing-rules/${id}/`);
      setPricingRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove this rule.');
    }
  };

  const handleConfirmDeleteBox = async () => {
    if (!boxToDelete) return;
    setDeletingBox(true);
    try {
      const result = await deleteBox(boxToDelete.id);
      if (result.success) {
        toast.success('Box deleted');
        setBoxToDelete(null);
        fetchAllData();
        refreshAll();
      } else {
        toast.error(result.error || 'Failed to delete box');
      }
    } finally {
      setDeletingBox(false);
    }
  };

  // Data derivation from API
  const {
    total_revenue = 0,
    total_bookings = 0,
    active_boxes_count = 0,
    pending_boxes_count = 0,
    avg_rating = '0.0',
    recent_bookings = [],
    all_owner_boxes = []
  } = dashboardData || {};

  // Stat tiles data
  const stats = [
    { key: 'revenue', tone: 'primary', icon: <DollarSign size={22} />, value: `₹${total_revenue}`, label: 'Total Revenue' },
    { key: 'bookings', tone: 'success', icon: <Calendar size={22} />, value: total_bookings, label: 'Total Bookings' },
    { key: 'active', tone: 'secondary', icon: <CheckCircle size={22} />, value: active_boxes_count, label: 'Active Boxes' },
    { key: 'rating', tone: 'warning', icon: <Star size={22} />, value: `${avg_rating} / 5`, label: 'Avg Rating' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader size="lg" text="Loading your dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <AlertCircle size={48} className="text-danger mx-auto mb-4" />
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">
            Oops! Something went wrong
          </h3>
          <p className="text-danger font-medium mb-6">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <Helmet>
        <title>Owner Dashboard | BoxNplay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
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
              <Building size={28} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Welcome back, {user?.first_name || user?.email?.split('@')[0] || 'Owner'}
              </h1>
              <p className="mt-1.5 text-muted-foreground flex items-center gap-2 text-sm sm:text-base">
                <Sparkles size={16} />
                Manage your sports facilities and track performance
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {pending_boxes_count > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                <Clock size={16} />
                <span>{pending_boxes_count} box{pending_boxes_count > 1 ? 'es' : ''} pending approval</span>
              </div>
            )}
            <Button onClick={() => setShowAddBoxModal(true)} icon={<Plus size={18} />}>
              Add New Box
            </Button>
          </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {stats.map((stat) => (
                  <StatTile key={stat.key} tone={stat.tone} icon={stat.icon} value={stat.value} label={stat.label} />
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 items-start">
                <Card padding="md" className="xl:col-span-2">
                  <h3 className="text-lg font-display font-semibold mb-4 text-foreground">Recent Bookings</h3>
                  {recent_bookings.length > 0 ? (
                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                      {recent_bookings.slice(0, 5).map((booking) => (
                        <div key={booking.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 sm:gap-0">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {booking.user_name || 'Customer'}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {booking.box_name} &bull; {new Date(booking.date).toLocaleDateString()}
                            </p>
                            {booking.time_slot && (
                              <p className="text-xs text-muted-foreground">{booking.time_slot}</p>
                            )}
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-1">
                            <span className="text-primary font-medium tabular-nums">₹{booking.amount}</span>
                            <Badge tone="success">Confirmed</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Placeholder text="No recent bookings" icon={Calendar} />
                  )}
                </Card>

                <OwnerScheduleCard boxes={all_owner_boxes} onQuickAdd={openAddBookingModal} onViewFull={() => setActiveTab('schedule')} />
              </div>
            </div>
          )}

          {/* Boxes Tab */}
          {activeTab === 'boxes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-display font-semibold text-foreground">My Sports Boxes</h2>
                <Button onClick={() => setShowAddBoxModal(true)} icon={<Plus size={18} />}>
                  Add New Box
                </Button>
              </div>

              {all_owner_boxes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {all_owner_boxes.map((box) => (
                    <Card key={box.id} padding="md" interactive className="flex flex-col">
                      <div className="relative mb-4">
                        <img
                          src={
                            box.image
                              ? (box.image.startsWith('http') ? box.image : `${MEDIA_BASE_URL}${box.image}`)
                              : FALLBACK_BOX_IMAGE
                          }
                          alt={box.name}
                          className="w-full h-40 sm:h-48 object-cover rounded-lg"
                          onError={(e) => {
                            e.target.src = FALLBACK_BOX_IMAGE;
                          }}
                        />
                        <div className="absolute top-3 right-3">
                          <Badge tone={BOX_STATUS_TONE[box.status] || 'neutral'} size="md" className="capitalize">
                            {box.status?.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>

                      <h3 className="text-xl font-display font-semibold text-foreground">{box.name}</h3>
                      <p className="text-muted-foreground text-sm mt-1">{box.location}</p>
                      <p className="text-primary font-medium text-lg mt-2 tabular-nums">
                        ₹{box.price}/hour
                      </p>

                      {(box.status === 'rejected' || box.status === 'changes_requested') && box.rejection_reason && (
                        <p className="mt-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                          {box.status === 'changes_requested' ? 'Changes requested: ' : 'Rejected: '}
                          {box.rejection_reason}
                        </p>
                      )}

                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" icon={<Eye size={16} />} fullWidth onClick={() => handleViewBox(box)}>
                          View
                        </Button>
                        <Button variant="outline" size="sm" icon={<Edit size={16} />} fullWidth onClick={() => handleEditBox(box)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline" size="sm" icon={<CalendarOff size={16} />}
                          onClick={() => openBlockedDatesModal(box)}
                          aria-label={`Manage blocked dates for ${box.name}`}
                          title="Manage blocked dates"
                        />
                        <Button
                          variant="outline" size="sm" icon={<Zap size={16} />}
                          onClick={() => openPricingRulesModal(box)}
                          aria-label={`Manage pricing for ${box.name}`}
                          title="Manage peak pricing"
                        />
                        <Button variant="outline" size="sm" icon={<Trash2 size={16} />} onClick={() => setBoxToDelete(box)} aria-label={`Delete ${box.name}`} />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card padding="lg" className="text-center">
                  <Placeholder text="No boxes found. Add your first sports box!" icon={Building} />
                </Card>
              )}
            </div>
          )}

          {/* Box Schedule Tab */}
          {activeTab === 'schedule' && (
            <OwnerScheduleTab boxes={all_owner_boxes} onQuickAdd={openAddBookingModal} />
          )}

          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <h2 className="text-2xl font-display font-semibold text-foreground">
                  Bookings on your boxes ({bookingsResult.count})
                </h2>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
                  <div className="w-full sm:w-56">
                    <Input
                      leadingIcon={<Search size={16} />}
                      placeholder="Search bookings..."
                      value={bookingSearch}
                      onChange={(e) => setBookingSearch(e.target.value)}
                    />
                  </div>
                  <Select value={bookingBoxFilter} onChange={(e) => setBookingBoxFilter(e.target.value)}>
                    <option value="">All boxes</option>
                    {all_owner_boxes.map((box) => (
                      <option key={box.id} value={box.id}>{box.name}</option>
                    ))}
                  </Select>
                  <Select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)}>
                    <option value="">All status</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="No-show">No-show</option>
                  </Select>
                  <Button onClick={openAddBookingModal} icon={<Plus size={16} />}>
                    Add booking
                  </Button>
                </div>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Customer', 'Box', 'Date & time', 'Amount', 'Status', ''].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bookingsLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">Loading bookings...</td>
                        </tr>
                      ) : bookingsResult.results.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">
                            {debouncedBookingSearch || bookingStatusFilter || bookingBoxFilter
                              ? 'No bookings match your filters' : 'No bookings yet'}
                          </td>
                        </tr>
                      ) : bookingsResult.results.map((booking) => {
                        // Client-side hint only — the >2h-notice guard is
                        // authoritative on the server, this just decides
                        // whether to show the button at all.
                        const bookingDateTime = new Date(`${booking.date}T${booking.start_time}:00`);
                        const canCancel = booking.booking_status === 'Confirmed'
                          && bookingDateTime.getTime() - Date.now() > 2 * 60 * 60 * 1000;
                        // Mirrors mark_no_show's own server-side rule — only
                        // once the slot's actual start time has passed.
                        const canMarkNoShow = booking.booking_status === 'Confirmed'
                          && bookingDateTime.getTime() <= Date.now();
                        return (
                          <tr
                            key={booking.id}
                            onClick={() => navigate(`/booking/${booking.id}`)}
                            className="hover:bg-elevated/60 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                  {(booking.customer_name || booking.user_name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-foreground whitespace-nowrap block">
                                    {booking.booking_source === 'owner_manual' ? (booking.customer_name || 'Walk-in') : booking.user_name}
                                  </span>
                                  {booking.booking_source === 'owner_manual' ? (
                                    <div className="flex items-center gap-1.5">
                                      <Badge tone="secondary" size="sm">Walk-in</Badge>
                                      {booking.customer_phone && (
                                        <span className="text-xs text-muted-foreground">{booking.customer_phone}</span>
                                      )}
                                    </div>
                                  ) : (
                                    // customer_phone_display falls back to the customer's
                                    // profile phone when this online booking never had
                                    // one recorded directly — see OwnerBookingSerializer.
                                    booking.customer_phone_display && (
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">{booking.customer_phone_display}</span>
                                    )
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{booking.box_name}</td>
                            <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                              {booking.date} &bull; {booking.start_time}-{booking.end_time}
                            </td>
                            <td className="py-3 px-4 font-medium text-foreground tabular-nums">₹{booking.total_amount}</td>
                            <td className="py-3 px-4">
                              <Badge tone={
                                booking.booking_status === 'Cancelled' ? 'danger'
                                  : booking.booking_status === 'Completed' ? 'primary'
                                  : booking.booking_status === 'No-show' ? 'warning'
                                  : 'success'
                              }>
                                {booking.booking_status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {canCancel && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<XCircle size={14} />}
                                    onClick={(e) => { e.stopPropagation(); openCancelModal(booking); }}
                                  >
                                    Cancel
                                  </Button>
                                )}
                                {canMarkNoShow && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<UserX size={14} />}
                                    onClick={(e) => { e.stopPropagation(); setNoShowBooking(booking); }}
                                  >
                                    Mark no-show
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={bookingsPage}
                  pageSize={BOOKINGS_PAGE_SIZE}
                  count={bookingsResult.count}
                  onPageChange={setBookingsPage}
                />
              </Card>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display font-semibold text-foreground">Business Analytics</h2>

              {analyticsLoading ? (
                <div className="py-12 flex justify-center"><Loader text="Loading analytics..." /></div>
              ) : !analyticsData ? (
                <Card padding="lg" className="text-center">
                  <Placeholder text="Analytics unavailable right now" icon={TrendingUp} />
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock size={20} className="text-primary" />
                        <h3 className="text-lg font-display font-semibold text-foreground">Peak booking hours</h3>
                      </div>
                      {(analyticsData.peak_hours?.data || []).length > 0 ? (
                        <PeakHoursChart data={{ labels: analyticsData.peak_hours.labels, values: analyticsData.peak_hours.data }} />
                      ) : (
                        <Placeholder text="No booking-hour data yet" icon={Clock} />
                      )}
                    </Card>

                    <Card padding="md">
                      <div className="flex items-center gap-2 mb-4">
                        <Activity size={20} className="text-primary" />
                        <h3 className="text-lg font-display font-semibold text-foreground">30-day performance</h3>
                      </div>
                      <dl className="space-y-3 text-sm">
                        {[
                          ['Occupancy (last 30 days)', `${analyticsData.occupancy_overall_pct}%`],
                          ['Cancellation rate', `${analyticsData.cancellation_rate_pct}%`],
                          ['Repeat customer rate', `${analyticsData.repeat_customer_rate_pct}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between items-center">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium text-foreground tabular-nums">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                    <Card padding="md">
                      <h3 className="text-lg font-display font-semibold text-foreground mb-4">Revenue by box</h3>
                      <div className="space-y-3">
                        {analyticsData.per_box_ranking.length > 0 ? analyticsData.per_box_ranking.map((box, i) => {
                          const max = analyticsData.per_box_ranking[0].revenue || 1
                          return (
                            <div key={`${box.name}-${i}`} className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-foreground">{box.name}</span>
                                <span className="font-medium text-muted-foreground tabular-nums">₹{box.revenue.toLocaleString()}</span>
                              </div>
                              <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                                <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${(box.revenue / max) * 100}%` }} />
                              </div>
                            </div>
                          )
                        }) : (
                          <div className="text-center py-8 text-muted-foreground">No revenue data yet</div>
                        )}
                      </div>
                    </Card>

                    <Card padding="md">
                      <h3 className="text-lg font-display font-semibold text-foreground mb-4">Occupancy by box (30 days)</h3>
                      <div className="space-y-3">
                        {analyticsData.occupancy_by_box.length > 0 ? analyticsData.occupancy_by_box.map((box, i) => (
                          <div key={`${box.box}-${i}`} className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-foreground">{box.box}</span>
                              <span className="font-medium text-muted-foreground tabular-nums">{box.occupancy_pct}%</span>
                            </div>
                            <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                              <div className="bg-turf h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, box.occupancy_pct)}%` }} />
                            </div>
                          </div>
                        )) : (
                          <div className="text-center py-8 text-muted-foreground">No occupancy data yet</div>
                        )}
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Payouts Tab */}
          {activeTab === 'payouts' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-display font-semibold text-foreground">Payouts</h2>
                {paySchedule && (
                  <Badge tone="secondary">
                    Next payout: {paySchedule.frequency.charAt(0).toUpperCase() + paySchedule.frequency.slice(1)}
                    {payoutBalance?.balance_due > 0 ? ` · ~₹${payoutBalance.balance_due.toLocaleString()} accruing` : ''}
                  </Badge>
                )}
              </div>

              <OwnerPayoutDetailsCard />

              {payoutBalanceLoading ? (
                <div className="py-8 flex justify-center"><Loader text="Loading balance..." /></div>
              ) : !payoutBalance ? (
                <Card padding="lg" className="text-center">
                  <Placeholder text="Balance unavailable right now" icon={Wallet} />
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <StatTile tone="primary" icon={<DollarSign size={22} />} value={`₹${payoutBalance.gross_revenue.toLocaleString()}`} label="Gross revenue" />
                    <StatTile tone="secondary" icon={<Activity size={22} />} value={`₹${payoutBalance.commission.toLocaleString()}`} label="Platform commission" />
                    <StatTile tone="success" icon={<CheckCircle size={22} />} value={`₹${payoutBalance.total_paid.toLocaleString()}`} label="Already paid out" />
                    <StatTile tone={payoutBalance.balance_due > 0 ? 'warning' : 'neutral'} icon={<Wallet size={22} />} value={`₹${payoutBalance.balance_due.toLocaleString()}`} label="Balance due to you" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Balance due is computed live from your completed bookings — it isn&apos;t a stored balance, and doesn&apos;t mean a payout has been logged yet. Payout history below shows what&apos;s actually been recorded as paid.
                  </p>

                  {payoutBalance.by_sport?.length > 0 && (
                    <Card padding="none" className="overflow-hidden">
                      <div className="px-6 pt-5 pb-1">
                        <h3 className="text-lg font-display font-semibold text-foreground">Earnings by sport</h3>
                        <p className="text-sm text-muted-foreground mt-1">Exactly what you&apos;re being charged and why — commission can vary by sport.</p>
                      </div>
                      <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm">
                          <thead className="bg-elevated">
                            <tr>
                              {['Sport', 'Rate', 'Gross', 'Commission', 'Net'].map((h) => (
                                <th key={h} className="text-left py-3 px-6 font-medium text-foreground whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {payoutBalance.by_sport.map((row) => (
                              <tr key={row.sport} className="hover:bg-elevated/60 transition-colors">
                                <td className="py-3 px-6 text-foreground">{row.sport}</td>
                                <td className="py-3 px-6 text-muted-foreground">{row.rate}%</td>
                                <td className="py-3 px-6 text-muted-foreground tabular-nums">₹{row.gross}</td>
                                <td className="py-3 px-6 text-muted-foreground tabular-nums">₹{row.commission}</td>
                                <td className="py-3 px-6 text-foreground tabular-nums">₹{row.net}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}

              <Card padding="none" className="overflow-hidden">
                <div className="px-6 pt-5 pb-1">
                  <h3 className="text-lg font-display font-semibold text-foreground">Payout history</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Amount', 'Source', 'Payment method', 'Transaction ID', 'Note', 'Date'].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payoutsLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">Loading history...</td>
                        </tr>
                      ) : payoutsResult.results.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">No payouts recorded yet</td>
                        </tr>
                      ) : payoutsResult.results.map((payout) => (
                        <tr key={payout.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4 font-medium text-foreground tabular-nums">₹{payout.amount}</td>
                          <td className="py-3 px-4">
                            <Badge tone={payout.source === 'scheduled' ? 'secondary' : 'neutral'}>
                              {payout.source === 'scheduled' ? 'Scheduled' : 'Manual'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{PAYMENT_METHOD_LABELS[payout.payment_method] || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{payout.transaction_id || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{payout.note || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(payout.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={payoutsPage}
                  pageSize={PAYOUTS_PAGE_SIZE}
                  count={payoutsResult.count}
                  onPageChange={setPayoutsPage}
                />
              </Card>
            </div>
          )}

          {/* Rewards Tab */}
          {activeTab === 'rewards' && <OwnerRewardsTab ownerBoxes={all_owner_boxes} />}

          {activeTab === 'verification' && <OwnerVerificationTab />}
        </div>
      </div>

      {/* Add Box Modal */}
      <AddBoxForm
        isOpen={showAddBoxModal}
        onClose={() => setShowAddBoxModal(false)}
        onSuccess={handleAddBoxSuccess}
      />

      {/* Edit Box Modal */}
      <AddBoxForm
        isOpen={showEditBoxModal}
        onClose={() => setShowEditBoxModal(false)}
        onSuccess={handleEditBoxSuccess}
        editMode={true}
        boxData={selectedBox}
      />

      {/* View Box Modal */}
      {showViewBoxModal && selectedBox && (
        <ViewBoxModal
          isOpen={showViewBoxModal}
          onClose={() => setShowViewBoxModal(false)}
          box={selectedBox}
          onBoxUpdated={fetchAllData}
        />
      )}

      {/* Delete Box Modal */}
      <Modal
        isOpen={!!boxToDelete}
        onClose={() => setBoxToDelete(null)}
        title="Delete box"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setBoxToDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirmDeleteBox} loading={deletingBox}>Delete box</Button>
          </>
        )}
      >
        {boxToDelete && (
          <p className="text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{boxToDelete.name}</span>? This cannot be undone
            and will also permanently delete <span className="font-semibold text-foreground">all booking history</span> for
            this box, including past and upcoming bookings. If you just want to stop taking new bookings, edit the box
            instead rather than deleting it.
          </p>
        )}
      </Modal>

      {/* Manage Blocked Dates Modal — whole-day holiday/maintenance blocks
          for one box, without deleting or editing the box itself. */}
      <Modal
        isOpen={!!blockedDatesBox}
        onClose={closeBlockedDatesModal}
        title={blockedDatesBox ? `Blocked dates — ${blockedDatesBox.name}` : 'Blocked dates'}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="date"
              value={newBlockedDate}
              onChange={(e) => { setNewBlockedDate(e.target.value); setBlockConflict(null); }}
              className="flex-1"
            />
            <Input
              placeholder="Reason (optional)"
              value={newBlockedReason}
              onChange={(e) => { setNewBlockedReason(e.target.value); setBlockConflict(null); }}
              className="flex-1"
            />
            <Button onClick={handleAddBlockedDate} loading={addingBlockedDate} icon={<Plus size={16} />}>
              Block
            </Button>
          </div>

          {/* Shown when the plain block above was rejected because this
              date already has Confirmed bookings on it — names exactly who
              would be cancelled/refunded so forcing it through is a
              deliberate, informed decision, not a silent side effect. */}
          {blockConflict && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-3">
              <div className="flex gap-2">
                <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{blockConflict.detail}</p>
              </div>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {blockConflict.conflicting_bookings.map((b) => (
                  <li key={b.id} className="text-sm text-muted-foreground flex justify-between gap-3 bg-elevated rounded-md px-2.5 py-1.5">
                    <span className="text-foreground font-medium">{b.customer_name}</span>
                    <span>{b.start_time}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="danger"
                  onClick={handleForceBlockedDate}
                  loading={forcingBlockedDate}
                  fullWidth
                >
                  Cancel these bookings and block this date anyway
                </Button>
                <Button variant="outline" onClick={() => setBlockConflict(null)} disabled={forcingBlockedDate}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {blockedDatesLoading ? (
            <Loader text="Loading blocked dates..." />
          ) : blockedDates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No blocked dates yet.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {blockedDates.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.date}</p>
                    {d.reason && <p className="text-xs text-muted-foreground">{d.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveBlockedDate(d.id)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label={`Unblock ${d.date}`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Manage Pricing Modal — peak/off-peak price overrides for one box.
          A rule is a flat replacement price for a weekday/weekend/all-days
          time window, not a multiplier — falls back to the box's own flat
          price whenever no rule matches a booking's start time. */}
      <Modal
        isOpen={!!pricingRulesBox}
        onClose={closePricingRulesModal}
        title={pricingRulesBox ? `Peak pricing — ${pricingRulesBox.name}` : 'Peak pricing'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Base price: <span className="font-semibold text-foreground">₹{pricingRulesBox?.price}/hr</span>.
            Add a rule to charge a different flat rate during a specific window.
          </p>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Applies to"
                value={newRule.applies_to}
                onChange={(e) => setNewRule((prev) => ({ ...prev, applies_to: e.target.value }))}
              >
                <option value="weekend">Weekends (Sat-Sun)</option>
                <option value="weekday">Weekdays (Mon-Fri)</option>
                <option value="all">Every day</option>
              </Select>
              <Input
                label="Price (₹/hr)"
                type="number"
                min="1"
                value={newRule.price}
                onChange={(e) => setNewRule((prev) => ({ ...prev, price: e.target.value }))}
              />
              <Input
                label="From"
                type="time"
                value={newRule.start_time}
                onChange={(e) => setNewRule((prev) => ({ ...prev, start_time: e.target.value }))}
              />
              <Input
                label="Until"
                type="time"
                value={newRule.end_time}
                onChange={(e) => setNewRule((prev) => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
            <Input
              label="Label (optional)"
              placeholder="e.g. Weekend peak"
              value={newRule.label}
              onChange={(e) => setNewRule((prev) => ({ ...prev, label: e.target.value }))}
            />
            <Button onClick={handleAddPricingRule} loading={addingRule} icon={<Plus size={16} />} fullWidth>
              Add rule
            </Button>
          </div>

          {pricingRulesLoading ? (
            <Loader text="Loading pricing rules..." />
          ) : pricingRules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No pricing rules yet — base price applies at all times.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {pricingRules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {rule.label || (rule.applies_to === 'weekend' ? 'Weekends' : rule.applies_to === 'weekday' ? 'Weekdays' : 'Every day')}
                      {' — '}₹{rule.price}/hr
                    </p>
                    <p className="text-xs text-muted-foreground">{rule.start_time}–{rule.end_time}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePricingRule(rule.id)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label={`Remove rule ${rule.label || rule.id}`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Cancel Booking Modal — reason is required, matches the backend's
          own validation, so a customer always sees why their booking was
          cancelled. */}
      <Modal
        isOpen={!!cancellingBooking}
        onClose={() => { setCancellingBooking(null); setCancelReason(''); }}
        title="Cancel booking"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setCancellingBooking(null); setCancelReason(''); }}>Back</Button>
            <Button variant="danger" onClick={handleConfirmCancel} loading={cancelling} disabled={!cancelReason.trim()}>
              Cancel booking
            </Button>
          </>
        )}
      >
        {cancellingBooking && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Cancel <span className="font-semibold text-foreground">{cancellingBooking.user_name}</span>&apos;s booking for{' '}
              <span className="font-semibold text-foreground">{cancellingBooking.box_name}</span> on{' '}
              {cancellingBooking.date} at {cancellingBooking.start_time}?
            </p>
            <div className="space-y-1.5">
              <label htmlFor="cancel-reason" className="block text-sm font-medium text-foreground">
                Reason (required — shown to the customer)
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
                placeholder="e.g. Facility closed for maintenance"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Mark No-show Modal — deliberately no reason field (unlike cancel):
          this doesn't notify-and-negotiate, it's a factual record that the
          customer never showed. No refund happens either way — see
          mark_no_show's docstring on OwnerBookingViewSet. */}
      <Modal
        isOpen={!!noShowBooking}
        onClose={() => setNoShowBooking(null)}
        title="Mark as no-show"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setNoShowBooking(null)}>Back</Button>
            <Button variant="danger" onClick={handleConfirmNoShow} loading={markingNoShow}>
              Mark no-show
            </Button>
          </>
        )}
      >
        {noShowBooking && (
          <p className="text-muted-foreground">
            Mark <span className="font-semibold text-foreground">
              {noShowBooking.booking_source === 'owner_manual' ? (noShowBooking.customer_name || 'Walk-in') : noShowBooking.user_name}
            </span>&apos;s booking for <span className="font-semibold text-foreground">{noShowBooking.box_name}</span> on{' '}
            {noShowBooking.date} at {noShowBooking.start_time} as a no-show? This confirms the slot went unused —
            no refund is issued, since this is different from a cancellation.
          </p>
        )}
      </Modal>

      {/* Add Booking Modal — owner-priority manual/walk-in booking. Submits
          to /owner_dashboard/bookings/book/, which preempts any customer
          currently holding or queued for the exact same slot. */}
      <Modal
        isOpen={showAddBookingModal}
        onClose={() => setShowAddBookingModal(false)}
        title="Add a booking"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowAddBookingModal(false)}>Cancel</Button>
            <Button onClick={handleAddBookingSubmit} loading={addingBooking}>Create booking</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reserving a slot here takes priority over any customer currently mid-checkout on it — they&apos;ll be
            notified their hold was released and asked to pick another slot.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="add-booking-box" className="block text-sm font-medium text-foreground">Box</label>
            <Select
              id="add-booking-box"
              value={addBookingForm.boxId}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, boxId: e.target.value }))}
            >
              <option value="">Select a box</option>
              {all_owner_boxes.filter((box) => box.status === 'approved').map((box) => (
                <option key={box.id} value={box.id}>{box.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              value={addBookingForm.date}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Input
              label="Start time"
              type="time"
              value={addBookingForm.startTime}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="add-booking-duration" className="block text-sm font-medium text-foreground">Duration (hours)</label>
            <Select
              id="add-booking-duration"
              value={addBookingForm.duration}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, duration: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Customer name (optional)"
              value={addBookingForm.customerName}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, customerName: e.target.value }))}
              placeholder="Walk-in customer"
            />
            <Input
              label="Customer phone (optional)"
              value={addBookingForm.customerPhone}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, customerPhone: e.target.value }))}
              placeholder="98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="add-booking-payment" className="block text-sm font-medium text-foreground">Payment</label>
            <Select
              id="add-booking-payment"
              value={addBookingForm.paymentStatus}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, paymentStatus: e.target.value }))}
            >
              <option value="Not Required">Not required (block only)</option>
              <option value="Completed">Cash collected at venue</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OwnerDashboard;
