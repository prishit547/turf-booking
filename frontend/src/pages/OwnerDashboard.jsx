// OwnerDashboard.jsx

import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Edit, Eye, TrendingUp, Calendar, DollarSign, Star, Clock, BarChart3,
  AlertCircle, CheckCircle, Activity, Sparkles, Building, Search, XCircle, Trash2, Wallet, CalendarOff, X, Zap, Gift, ShieldCheck, UserX, Download,
} from 'lucide-react';
import { toast } from 'react-toastify';

import AddBoxForm from '../components/boxes/AddBoxForm';
import ViewBoxModal from '../components/boxes/ViewBoxModal';
import OwnerRewardsTab from '../components/rewards/OwnerRewardsTab';
import OwnerVerificationTab from '../components/verification/OwnerVerificationTab';
import OwnerPayoutDetailsCard from '../components/payouts/OwnerPayoutDetailsCard';
import OwnerEarningsTab from '../components/payouts/OwnerEarningsTab';
import { OwnerScheduleCard } from '../components/bookings/OwnerScheduleCard';
import { OwnerScheduleTab } from '../components/bookings/OwnerScheduleTab';
import { useAuth, api, resolveMediaUrl } from '../api.jsx';
import { useBox } from '../context/BoxContext';
import { Button, Card, Badge, Loader, StatTile, Input, Select, Modal, Pagination } from '../components/ui';
import { PeakHoursChart } from '../components/common/AdvancedCharts';
import { useDebounce } from '../hooks/useDebounce';
import { useTabParam } from '../hooks/useTabParam';

const BOOKINGS_PAGE_SIZE = 20
// Index matches the backend's weekday param (0=Monday..6=Sunday), which
// follows Python's date.weekday().
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
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
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'rewards', label: 'Rewards', icon: Gift },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
];
const TAB_IDS = TABS.map((t) => t.id);

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
  const [activeTab, setActiveTab] = useTabParam('overview', TAB_IDS);
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
  // Bulk selection on the Bookings tab — only Confirmed rows are selectable,
  // since they're the only ones that can be cancelled.
  const [selectedBookingIds, setSelectedBookingIds] = useState([]);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [exportingBookings, setExportingBookings] = useState(false);
  const [exportingPayouts, setExportingPayouts] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [noShowBooking, setNoShowBooking] = useState(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);

  const [boxToDelete, setBoxToDelete] = useState(null);
  const [deletingBox, setDeletingBox] = useState(false);

  // My Boxes grid: all_owner_boxes is already fetched whole (it's also the
  // data source for filter dropdowns elsewhere on this page, which need the
  // full list) — paginated client-side over that same array rather than a
  // separate fetch, so a multi-location owner's grid doesn't turn into an
  // unbroken wall of cards.
  const MY_BOXES_PAGE_SIZE = 9;
  const [myBoxesPage, setMyBoxesPage] = useState(1);

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
  // Recurring ("every Monday until X") blocks, so a standing weekly closure
  // isn't entered one date at a time forever.
  const [blockMode, setBlockMode] = useState('single');
  const [recurring, setRecurring] = useState({ weekday: '0', start_date: '', end_date: '' });

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

  // Selection is page-scoped — the ids it holds refer to rows that are no
  // longer on screen once the page or filters change.
  useEffect(() => {
    setSelectedBookingIds([]);
  }, [bookingsPage, debouncedBookingSearch, bookingStatusFilter, bookingBoxFilter]);

  // Mirrors the per-row `canCancel` rule below: Confirmed, and more than the
  // server's 2-hour notice window away.
  const cancellableIds = bookingsResult.results
    .filter((b) => b.booking_status === 'Confirmed'
      && new Date(`${b.date}T${b.start_time}:00`).getTime() - Date.now() > 2 * 60 * 60 * 1000)
    .map((b) => b.id);

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

  const handleBulkCancel = async () => {
    if (!selectedBookingIds.length || !bulkCancelReason.trim()) return;
    setBulkCancelling(true);
    try {
      const { data } = await api.post('/owner_dashboard/bookings/bulk-cancel/', {
        booking_ids: selectedBookingIds, reason: bulkCancelReason.trim(),
      });
      // Partial success is normal here (a booking inside its cancellation
      // window is refused individually), so report rather than assume.
      if (data.failed?.length) {
        toast.warning(data.detail);
      } else {
        toast.success(data.detail);
      }
      setShowBulkCancelModal(false);
      setBulkCancelReason('');
      setSelectedBookingIds([]);
      fetchBookings();
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel these bookings');
    } finally {
      setBulkCancelling(false);
    }
  };

  const handleExportBookings = async () => {
    setExportingBookings(true);
    try {
      const params = new URLSearchParams();
      if (debouncedBookingSearch) params.set('search', debouncedBookingSearch);
      if (bookingStatusFilter) params.set('status', bookingStatusFilter);
      if (bookingBoxFilter) params.set('box', bookingBoxFilter);
      const response = await api.get(`/owner_dashboard/bookings/export/?${params.toString()}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not export bookings.');
    } finally {
      setExportingBookings(false);
    }
  };

  const handleExportPayouts = async () => {
    setExportingPayouts(true);
    try {
      const response = await api.get('/owner_dashboard/payouts/export/', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not export payouts.');
    } finally {
      setExportingPayouts(false);
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

  const submitRecurringBlock = async (force = false) => {
    if (!recurring.start_date || !recurring.end_date) {
      toast.error('Pick a start and end date for the recurring block.');
      return;
    }
    const setLoading = force ? setForcingBlockedDate : setAddingBlockedDate;
    setBlockConflict(null);
    setLoading(true);
    try {
      const response = await api.post('/boxes/blocked-dates/recurring/', {
        box: blockedDatesBox.id,
        weekday: Number(recurring.weekday),
        start_date: recurring.start_date,
        end_date: recurring.end_date,
        reason: newBlockedReason.trim(),
        ...(force ? { force: true } : {}),
      });
      toast.success(response.data.detail || 'Dates blocked.');
      setRecurring({ weekday: '0', start_date: '', end_date: '' });
      setNewBlockedReason('');
      // The bulk endpoint returns counts, not the rows themselves — refetch
      // so the list below reflects every date it just created.
      openBlockedDatesModal(blockedDatesBox);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 400 && data?.conflicting_bookings?.length) {
        setBlockConflict(data);
      } else {
        toast.error(data?.detail || 'Failed to block these dates.');
      }
    } finally {
      setLoading(false);
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
    { key: 'revenue', tone: 'primary', icon: <DollarSign size={22} />, value: `₹${total_revenue}`, label: 'Gross revenue · all time' },
    { key: 'bookings', tone: 'success', icon: <Calendar size={22} />, value: total_bookings, label: 'Total bookings · all time' },
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
        <nav className="flex flex-nowrap gap-2 mt-6 overflow-x-auto no-scrollbar" aria-label="Tabs" role="tablist">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={isActive}
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
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {all_owner_boxes.slice((myBoxesPage - 1) * MY_BOXES_PAGE_SIZE, myBoxesPage * MY_BOXES_PAGE_SIZE).map((box) => (
                    <Card key={box.id} padding="md" interactive className="flex flex-col">
                      <div className="relative mb-4">
                        <img
                          src={resolveMediaUrl(box.image) || FALLBACK_BOX_IMAGE}
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
                <Pagination
                  page={myBoxesPage}
                  pageSize={MY_BOXES_PAGE_SIZE}
                  count={all_owner_boxes.length}
                  onPageChange={setMyBoxesPage}
                />
                </>
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
                  <Button variant="outline" onClick={handleExportBookings} loading={exportingBookings} icon={<Download size={16} />}>
                    Export CSV
                  </Button>
                  <Button onClick={openAddBookingModal} icon={<Plus size={16} />}>
                    Add booking
                  </Button>
                </div>
              </div>

              {selectedBookingIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
                  <p className="text-sm text-foreground">
                    {selectedBookingIds.length} booking{selectedBookingIds.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedBookingIds([])}>
                      Clear
                    </Button>
                    <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => setShowBulkCancelModal(true)}>
                      Cancel selected
                    </Button>
                  </div>
                </div>
              )}

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        <th className="py-3 pl-4 pr-1 w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all cancellable bookings on this page"
                            className="accent-primary"
                            checked={cancellableIds.length > 0 && selectedBookingIds.length === cancellableIds.length}
                            onChange={(e) => setSelectedBookingIds(e.target.checked ? cancellableIds : [])}
                            disabled={cancellableIds.length === 0}
                          />
                        </th>
                        {['Customer', 'Box', 'Date & time', 'Amount', 'Status', ''].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bookingsLoading ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-muted-foreground">Loading bookings...</td>
                        </tr>
                      ) : bookingsResult.results.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-muted-foreground">
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
                            <td className="py-3 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select booking ${booking.id}`}
                                className="accent-primary"
                                disabled={!canCancel}
                                checked={selectedBookingIds.includes(booking.id)}
                                onChange={(e) => setSelectedBookingIds((prev) => (
                                  e.target.checked ? [...prev, booking.id] : prev.filter((id) => id !== booking.id)
                                ))}
                              />
                            </td>
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
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h3 className="text-lg font-display font-semibold text-foreground">Revenue by box · all time</h3>
                        <button type="button" onClick={() => setActiveTab('earnings')} className="shrink-0 text-xs font-medium text-primary hover:underline">
                          Net earnings by period →
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">
                        Gross revenue, before platform commission. For net earnings by month, see Earnings.
                      </p>
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
          {activeTab === 'earnings' && <OwnerEarningsTab />}

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
                    <StatTile tone="primary" icon={<DollarSign size={22} />} value={`₹${payoutBalance.gross_revenue.toLocaleString()}`} label="Gross revenue · all time" />
                    <StatTile tone="secondary" icon={<Activity size={22} />} value={`₹${payoutBalance.commission.toLocaleString()}`} label="Platform commission · all time" />
                    <StatTile tone="success" icon={<CheckCircle size={22} />} value={`₹${payoutBalance.total_paid.toLocaleString()}`} label="Already paid out · all time" />
                    <StatTile tone={payoutBalance.balance_due > 0 ? 'warning' : 'neutral'} icon={<Wallet size={22} />} value={`₹${payoutBalance.balance_due.toLocaleString()}`} label="Balance due to you · now" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    These are lifetime totals. Balance due is computed live from your completed bookings — it isn&apos;t a stored balance, and doesn&apos;t mean a payout has been logged yet. Payout history below shows what&apos;s actually been recorded as paid. For month-by-month figures, see the <button type="button" onClick={() => setActiveTab('earnings')} className="text-primary hover:underline">Earnings</button> tab.
                  </p>

                  {payoutBalance.by_box?.length > 0 && (
                    <Card padding="none" className="overflow-hidden">
                      <div className="px-6 pt-5 pb-1">
                        <h3 className="text-lg font-display font-semibold text-foreground">Where your balance comes from</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Lifetime earnings per box, so you can check the combined payout figure adds up.
                        </p>
                      </div>
                      <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm">
                          <thead className="bg-elevated">
                            <tr>
                              {['Box', 'Bookings', 'Gross', 'Commission', 'Net'].map((h, i) => (
                                <th key={h} className={`py-3 px-6 font-medium text-foreground whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {payoutBalance.by_box.map((row) => (
                              <tr key={row.box_id}>
                                <td className="py-3 px-6">
                                  <p className="text-foreground font-medium">{row.box_name}</p>
                                  <span className="text-xs text-muted-foreground">{row.sport} · {row.rate}% commission</span>
                                </td>
                                <td className="py-3 px-6 text-right text-muted-foreground tabular-nums">{row.bookings}</td>
                                <td className="py-3 px-6 text-right text-foreground tabular-nums">₹{row.gross.toLocaleString()}</td>
                                <td className="py-3 px-6 text-right text-warning tabular-nums">−₹{row.commission.toLocaleString()}</td>
                                <td className="py-3 px-6 text-right font-medium text-success tabular-nums">₹{row.net.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border bg-elevated/50">
                              <td className="py-3 px-6 font-display font-semibold text-foreground">Combined · all time</td>
                              <td className="py-3 px-6" />
                              <td className="py-3 px-6 text-right font-medium text-foreground tabular-nums">₹{payoutBalance.gross_revenue.toLocaleString()}</td>
                              <td className="py-3 px-6 text-right font-medium text-warning tabular-nums">−₹{payoutBalance.commission.toLocaleString()}</td>
                              <td className="py-3 px-6 text-right font-bold text-success tabular-nums">₹{payoutBalance.net_revenue.toLocaleString()}</td>
                            </tr>
                            <tr className="bg-elevated/30 text-muted-foreground">
                              <td className="py-2.5 px-6" colSpan={4}>Less already paid out</td>
                              <td className="py-2.5 px-6 text-right tabular-nums">−₹{payoutBalance.total_paid.toLocaleString()}</td>
                            </tr>
                            <tr className="border-t border-border">
                              <td className="py-3 px-6 font-display font-semibold text-foreground" colSpan={4}>Balance due to you</td>
                              <td className="py-3 px-6 text-right font-bold text-primary tabular-nums">₹{payoutBalance.balance_due.toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>
                  )}

                  {payoutBalance.by_sport?.length > 0 && (
                    <Card padding="none" className="overflow-hidden">
                      <div className="px-6 pt-5 pb-1">
                        <h3 className="text-lg font-display font-semibold text-foreground">Earnings by sport · all time</h3>
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
                <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
                  <h3 className="text-lg font-display font-semibold text-foreground">Payout history</h3>
                  <Button variant="outline" size="sm" onClick={handleExportPayouts} loading={exportingPayouts} icon={<Download size={14} />}>
                    Export CSV
                  </Button>
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
        onImagesChanged={() => { fetchAllData(); refreshAll(); }}
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
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-elevated p-1">
            {[{ id: 'single', label: 'One date' }, { id: 'recurring', label: 'Every week' }].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setBlockMode(m.id); setBlockConflict(null); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  blockMode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {blockMode === 'single' ? (
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
          ) : (
            <div className="space-y-2">
              <Select
                label="Repeat every"
                value={recurring.weekday}
                onChange={(e) => { setRecurring((r) => ({ ...r, weekday: e.target.value })); setBlockConflict(null); }}
              >
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="From" type="date" value={recurring.start_date}
                  onChange={(e) => { setRecurring((r) => ({ ...r, start_date: e.target.value })); setBlockConflict(null); }}
                />
                <Input
                  label="Until" type="date" value={recurring.end_date}
                  onChange={(e) => { setRecurring((r) => ({ ...r, end_date: e.target.value })); setBlockConflict(null); }}
                />
              </div>
              <Input
                placeholder="Reason (optional)"
                value={newBlockedReason}
                onChange={(e) => { setNewBlockedReason(e.target.value); setBlockConflict(null); }}
              />
              <Button onClick={() => submitRecurringBlock(false)} loading={addingBlockedDate} icon={<Plus size={16} />} fullWidth>
                Block every {WEEKDAYS[Number(recurring.weekday)]}
              </Button>
            </div>
          )}

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
                    <span>{b.date ? `${b.date} ${b.start_time}` : b.start_time}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="danger"
                  onClick={() => (blockMode === 'recurring' ? submitRecurringBlock(true) : handleForceBlockedDate())}
                  loading={forcingBlockedDate}
                  fullWidth
                >
                  Cancel these bookings and block anyway
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

      <Modal
        isOpen={showBulkCancelModal}
        onClose={() => { setShowBulkCancelModal(false); setBulkCancelReason(''); }}
        title={`Cancel ${selectedBookingIds.length} booking${selectedBookingIds.length !== 1 ? 's' : ''}`}
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowBulkCancelModal(false); setBulkCancelReason(''); }}>Back</Button>
            <Button variant="danger" onClick={handleBulkCancel} loading={bulkCancelling} disabled={!bulkCancelReason.trim()}>
              Cancel {selectedBookingIds.length} booking{selectedBookingIds.length !== 1 ? 's' : ''}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            All {selectedBookingIds.length} selected booking{selectedBookingIds.length !== 1 ? 's' : ''} will be cancelled
            and the customers refunded. Anything already inside its cancellation window will be reported back as skipped.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="bulk-cancel-reason" className="block text-sm font-medium text-foreground">
              Reason (required — shown to every affected customer)
            </label>
            <textarea
              id="bulk-cancel-reason"
              value={bulkCancelReason}
              onChange={(e) => setBulkCancelReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="e.g. Facility closed for emergency maintenance"
            />
          </div>
        </div>
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
