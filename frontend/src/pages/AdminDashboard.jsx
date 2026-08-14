import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Users, Calendar, DollarSign, TrendingUp, Search, Edit, Eye, Shield, AlertTriangle, CheckCircle, X, Clock, BarChart3, FileText, Star, Trash2, Wallet, Ticket, Plus, Gift } from 'lucide-react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js'
import { toast } from 'react-toastify'
import { useAuth, api } from '../api.jsx'
import { useBox } from '../context/BoxContext'
import { Button, Card, Badge, Modal, Loader, StatTile, Input, Select, Pagination, RatingStars } from '../components/ui'
import { PeakHoursChart } from '../components/common/AdvancedCharts'
import { useChartTheme } from '../utils/chartTheme'
import { useDebounce } from '../hooks/useDebounce'
import AdminRewardsTab from '../components/rewards/AdminRewardsTab'
import AdminCommissionTab from '../components/commission/AdminCommissionTab'

const USERS_PAGE_SIZE = 20
const BOOKINGS_PAGE_SIZE = 20
const REVIEWS_PAGE_SIZE = 20
const PAYOUTS_PAGE_SIZE = 20

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
)

const ChartEmptyState = ({ label = 'No data yet' }) => (
  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
    {label}
  </div>
)

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'approvals', label: 'Box Approvals', icon: CheckCircle },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'coupons', label: 'Coupons', icon: Ticket },
  { id: 'rewards', label: 'Rewards', icon: Gift },
  { id: 'commission', label: 'Commission', icon: DollarSign },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: FileText },
]

const ROLE_TONE = { Owner: 'secondary', Admin: 'danger', User: 'primary' }
const USER_STATUS_TONE = { Active: 'success', Inactive: 'danger', Suspended: 'danger' }
const BOOKING_STATUS_TONE = { Confirmed: 'success', Completed: 'primary', Cancelled: 'danger' }
const ACTIVITY_TONE = { approval: 'warning', user: 'primary', booking: 'success' }

const initial = (value) => (value || '?').charAt(0).toUpperCase()

const formatDate = (value) => {
  if (!value) return 'N/A'
  const d = new Date(value)
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString()
}

// Exports already-fetched data as a downloaded CSV — no backend endpoint needed.
const exportToCsv = (filename, rows) => {
  if (!rows || rows.length === 0) {
    toast.info('No data available to export yet.')
    return
  }
  const headers = Object.keys(rows[0])
  const escapeCell = (value) => {
    const str = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState('')
  const [bookingDateFrom, setBookingDateFrom] = useState('')
  const [bookingDateTo, setBookingDateTo] = useState('')
  const [bookingsPage, setBookingsPage] = useState(1)
  const [bookingsResult, setBookingsResult] = useState({ results: [], count: 0 })
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [selectedBox, setSelectedBox] = useState(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showChangesModal, setShowChangesModal] = useState(false)
  const [changesReason, setChangesReason] = useState('')
  const [adminData, setAdminData] = useState(null)
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [adminError, setAdminError] = useState(null)

  // Users tab: its own paginated/filtered fetch against /user/users/,
  // separate from the adminData summary payload above (which still backs
  // the Reports tab's CSV export and the Overview stat tiles).
  const [usersPage, setUsersPage] = useState(1)
  const [usersResult, setUsersResult] = useState({ results: [], count: 0 })
  const [usersLoading, setUsersLoading] = useState(false)
  const [showUserViewModal, setShowUserViewModal] = useState(false)
  const [showUserEditModal, setShowUserEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editRole, setEditRole] = useState('user')
  const [editActive, setEditActive] = useState(true)
  const [savingUser, setSavingUser] = useState(false)

  // Reviews tab: paginated moderation list against /boxes/admin/reviews/.
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewsPage, setReviewsPage] = useState(1)
  const [reviewsResult, setReviewsResult] = useState({ results: [], count: 0 })
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewToDelete, setReviewToDelete] = useState(null)
  const [deletingReview, setDeletingReview] = useState(false)

  // Payouts tab: per-owner balance summary + a "record payout" action.
  const [payoutsBalance, setPayoutsBalance] = useState([])
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutTarget, setPayoutTarget] = useState(null)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [recordingPayout, setRecordingPayout] = useState(false)

  // Payout schedules — one per owner, admin-configurable cadence for
  // run_scheduled_payouts_task. Keyed by owner_id for O(1) lookup per row.
  const [payoutSchedules, setPayoutSchedules] = useState({})
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({ frequency: 'monthly', day_of_month: '1', day_of_week: '0' })
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Payout history — every Payout row (manual + scheduled) across all
  // owners, distinguished by a source badge.
  const [payoutHistory, setPayoutHistory] = useState({ results: [], count: 0 })
  const [payoutHistoryPage, setPayoutHistoryPage] = useState(1)
  const [payoutHistoryLoading, setPayoutHistoryLoading] = useState(false)

  // Coupons tab: create/list/deactivate discount codes.
  const [coupons, setCoupons] = useState([])
  const [couponsLoading, setCouponsLoading] = useState(false)
  const [showCreateCouponModal, setShowCreateCouponModal] = useState(false)
  const [newCoupon, setNewCoupon] = useState({ code: '', discount_type: 'percent', value: '', max_uses: '' })
  const [creatingCoupon, setCreatingCoupon] = useState(false)

  const { user } = useAuth()
  const { pendingBoxes, fetchPendingBoxes, approveBox, rejectBox, requestBoxChanges } = useBox()
  const chartTheme = useChartTheme()
  const debouncedUserSearch = useDebounce(searchTerm, 300)
  const debouncedBookingSearch = useDebounce(bookingSearch, 300)
  const debouncedReviewSearch = useDebounce(reviewSearch, 300)

  useEffect(() => {
    fetchPendingBoxes()
  }, [fetchPendingBoxes])

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const params = new URLSearchParams({ page: usersPage, page_size: USERS_PAGE_SIZE })
      if (debouncedUserSearch) params.set('search', debouncedUserSearch)
      if (roleFilter) params.set('role', roleFilter)
      const response = await api.get(`/user/users/?${params.toString()}`)
      setUsersResult({ results: response.data.results, count: response.data.count })
    } catch (err) {
      console.error('Error fetching users:', err)
      toast.error('Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [usersPage, debouncedUserSearch, roleFilter])

  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
  }, [activeTab, fetchUsers])

  // Reset to page 1 whenever the search/role filter changes.
  useEffect(() => {
    setUsersPage(1)
  }, [debouncedUserSearch, roleFilter])

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true)
    try {
      const params = new URLSearchParams({ page: bookingsPage, page_size: BOOKINGS_PAGE_SIZE })
      if (debouncedBookingSearch) params.set('search', debouncedBookingSearch)
      if (bookingStatusFilter) params.set('status', bookingStatusFilter)
      if (bookingDateFrom) params.set('date_from', bookingDateFrom)
      if (bookingDateTo) params.set('date_to', bookingDateTo)
      const response = await api.get(`/bookings/admin/?${params.toString()}`)
      setBookingsResult({ results: response.data.results, count: response.data.count })
    } catch (err) {
      console.error('Error fetching bookings:', err)
      toast.error('Failed to load bookings')
    } finally {
      setBookingsLoading(false)
    }
  }, [bookingsPage, debouncedBookingSearch, bookingStatusFilter, bookingDateFrom, bookingDateTo])

  useEffect(() => {
    if (activeTab === 'bookings') fetchBookings()
  }, [activeTab, fetchBookings])

  useEffect(() => {
    setBookingsPage(1)
  }, [debouncedBookingSearch, bookingStatusFilter, bookingDateFrom, bookingDateTo])

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true)
    try {
      const params = new URLSearchParams({ page: reviewsPage, page_size: REVIEWS_PAGE_SIZE })
      if (debouncedReviewSearch) params.set('search', debouncedReviewSearch)
      const response = await api.get(`/boxes/admin/reviews/?${params.toString()}`)
      setReviewsResult({ results: response.data.results, count: response.data.count })
    } catch (err) {
      console.error('Error fetching reviews:', err)
      toast.error('Failed to load reviews')
    } finally {
      setReviewsLoading(false)
    }
  }, [reviewsPage, debouncedReviewSearch])

  useEffect(() => {
    if (activeTab === 'reviews') fetchReviews()
  }, [activeTab, fetchReviews])

  useEffect(() => {
    setReviewsPage(1)
  }, [debouncedReviewSearch])

  const handleConfirmDeleteReview = async () => {
    if (!reviewToDelete) return
    setDeletingReview(true)
    try {
      await api.delete(`/boxes/admin/reviews/${reviewToDelete.id}/`)
      toast.success('Review deleted')
      setReviewToDelete(null)
      fetchReviews()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete review')
    } finally {
      setDeletingReview(false)
    }
  }

  const fetchPayoutsBalance = useCallback(async () => {
    setPayoutsLoading(true)
    try {
      const response = await api.get('/owner_dashboard/payouts/balance/')
      setPayoutsBalance(response.data)
    } catch (err) {
      console.error('Error fetching payout balances:', err)
      toast.error('Failed to load payout balances')
    } finally {
      setPayoutsLoading(false)
    }
  }, [])

  const fetchPayoutSchedules = useCallback(async () => {
    try {
      const response = await api.get('/owner_dashboard/payout-schedules/')
      const list = response.data.results || response.data
      const byOwner = {}
      list.forEach((s) => { byOwner[s.owner] = s })
      setPayoutSchedules(byOwner)
    } catch (err) {
      console.error('Error fetching payout schedules:', err)
    }
  }, [])

  const fetchPayoutHistory = useCallback(async () => {
    setPayoutHistoryLoading(true)
    try {
      const params = new URLSearchParams({ page: payoutHistoryPage, page_size: PAYOUTS_PAGE_SIZE })
      const response = await api.get(`/owner_dashboard/payouts/?${params.toString()}`)
      setPayoutHistory({ results: response.data.results, count: response.data.count })
    } catch (err) {
      console.error('Error fetching payout history:', err)
      toast.error('Failed to load payout history')
    } finally {
      setPayoutHistoryLoading(false)
    }
  }, [payoutHistoryPage])

  useEffect(() => {
    if (activeTab === 'payouts') {
      fetchPayoutsBalance()
      fetchPayoutSchedules()
      fetchPayoutHistory()
    }
  }, [activeTab, fetchPayoutsBalance, fetchPayoutSchedules, fetchPayoutHistory])

  const openScheduleModal = (owner) => {
    const existing = payoutSchedules[owner.owner_id]
    setScheduleForm(existing
      ? { frequency: existing.frequency, day_of_month: String(existing.day_of_month || 1), day_of_week: String(existing.day_of_week || 0) }
      : { frequency: 'monthly', day_of_month: '1', day_of_week: '0' })
    setScheduleTarget(owner)
  }

  const handleSaveSchedule = async () => {
    if (!scheduleTarget) return
    setSavingSchedule(true)
    try {
      const existing = payoutSchedules[scheduleTarget.owner_id]
      const payload = {
        owner: scheduleTarget.owner_id,
        frequency: scheduleForm.frequency,
        day_of_month: scheduleForm.frequency === 'monthly' ? Number(scheduleForm.day_of_month) : null,
        day_of_week: scheduleForm.frequency !== 'monthly' ? Number(scheduleForm.day_of_week) : null,
        active: true,
      }
      if (existing) {
        await api.patch(`/owner_dashboard/payout-schedules/${existing.id}/`, payload)
      } else {
        await api.post('/owner_dashboard/payout-schedules/', payload)
      }
      toast.success('Payout schedule saved')
      setScheduleTarget(null)
      fetchPayoutSchedules()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save payout schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  const openRecordPayoutModal = (owner) => {
    setPayoutTarget(owner)
    setPayoutAmount('')
    setPayoutNote('')
  }

  const handleRecordPayout = async () => {
    if (!payoutTarget || !payoutAmount || Number(payoutAmount) <= 0) return
    setRecordingPayout(true)
    try {
      await api.post('/owner_dashboard/payouts/', {
        owner: payoutTarget.owner_id, amount: payoutAmount, note: payoutNote,
      })
      toast.success('Payout recorded')
      setPayoutTarget(null)
      fetchPayoutsBalance()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payout')
    } finally {
      setRecordingPayout(false)
    }
  }

  const fetchCoupons = useCallback(async () => {
    setCouponsLoading(true)
    try {
      const response = await api.get('/bookings/admin/coupons/')
      setCoupons(response.data.results || response.data)
    } catch (err) {
      console.error('Error fetching coupons:', err)
      toast.error('Failed to load coupons')
    } finally {
      setCouponsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'coupons') fetchCoupons()
  }, [activeTab, fetchCoupons])

  const handleCreateCoupon = async () => {
    if (!newCoupon.code.trim() || !newCoupon.value) return
    setCreatingCoupon(true)
    try {
      await api.post('/bookings/admin/coupons/', {
        code: newCoupon.code.trim(),
        discount_type: newCoupon.discount_type,
        value: newCoupon.value,
        max_uses: newCoupon.max_uses || null,
      })
      toast.success('Coupon created')
      setShowCreateCouponModal(false)
      setNewCoupon({ code: '', discount_type: 'percent', value: '', max_uses: '' })
      fetchCoupons()
    } catch (err) {
      toast.error(err.response?.data?.code?.[0] || err.response?.data?.detail || 'Failed to create coupon')
    } finally {
      setCreatingCoupon(false)
    }
  }

  const handleToggleCouponActive = async (coupon) => {
    try {
      await api.patch(`/bookings/admin/coupons/${coupon.id}/`, { active: !coupon.active })
      fetchCoupons()
    } catch {
      toast.error('Failed to update coupon')
    }
  }

  const openViewUserModal = (u) => {
    setEditingUser(u)
    setShowUserViewModal(true)
  }

  const openEditUserModal = (u) => {
    setEditingUser(u)
    setEditRole(u.role)
    setEditActive(u.is_active)
    setShowUserEditModal(true)
  }

  const handleSaveUser = async () => {
    if (!editingUser) return
    setSavingUser(true)
    try {
      await api.patch(`/user/users/${editingUser.id}/admin-update/`, { role: editRole, is_active: editActive })
      toast.success('User updated')
      setShowUserEditModal(false)
      setEditingUser(null)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user')
    } finally {
      setSavingUser(false)
    }
  }

  const fetchAdminData = useCallback(async () => {
    setLoadingAdmin(true)
    setAdminError(null)
    try {
      const response = await api.get('/user/admin-dashboard/')
      setAdminData(response.data)
    } catch (err) {
      console.error('Error fetching admin dashboard:', err)
      setAdminError('Failed to load admin dashboard data.')
    } finally {
      setLoadingAdmin(false)
    }
  }, [])

  useEffect(() => {
    fetchAdminData()
  }, [fetchAdminData])

  // No hardcoded fallback numbers here: charts only ever render real data
  // from the backend. Empty arrays make hasRevenueData/hasSportsData/
  // hasUserGrowthData below false, which renders an explicit empty state
  // instead of a chart with fabricated numbers.
  const revenueData = {
    labels: adminData?.revenue_chart?.labels || [],
    datasets: [
      {
        label: 'Platform Revenue (₹)',
        data: adminData?.revenue_chart?.data || [],
        borderColor: chartTheme.colors.primary,
        backgroundColor: chartTheme.hexToRgba(chartTheme.colors.primary, 0.1),
        pointBackgroundColor: chartTheme.colors.primary,
        tension: 0.4,
        fill: true,
      },
    ],
  }
  const hasRevenueData = (adminData?.revenue_chart?.data || []).some((v) => v > 0)

  const sportsData = {
    labels: adminData?.sports_distribution?.labels || [],
    datasets: [
      {
        data: adminData?.sports_distribution?.data || [],
        backgroundColor: (adminData?.sports_distribution?.labels || []).map(
          (_, i) => chartTheme.series[i % chartTheme.series.length]
        ),
        borderWidth: 0,
      },
    ],
  }
  const hasSportsData = (adminData?.sports_distribution?.data || []).length > 0

  const userGrowthData = {
    labels: adminData?.user_growth_chart?.labels || [],
    datasets: [
      {
        label: 'New Users',
        data: adminData?.user_growth_chart?.data || [],
        backgroundColor: chartTheme.hexToRgba(chartTheme.colors.success, 0.8),
        borderRadius: 4,
      },
    ],
  }
  const hasUserGrowthData = (adminData?.user_growth_chart?.data || []).some((v) => v > 0)

  const users = adminData?.users || []
  const boxes = adminData?.boxes || adminData?.boxes_overview || []
  const bookings = adminData?.bookings || []

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { color: chartTheme.text } },
      tooltip: chartTheme.tooltip,
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartTheme.text } },
      y: { beginAtZero: true, grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text } },
    },
  }

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: chartTheme.text } },
      tooltip: chartTheme.tooltip,
    },
  }

  const handleApproveBox = async (boxId) => {
    const result = await approveBox(boxId)
    if (result.success) {
      toast.success('Box approved successfully')
      fetchPendingBoxes()
      fetchAdminData()
    } else {
      toast.error(result.error || 'Failed to approve box')
    }
  }

  const handleRejectBox = async (boxId) => {
    const result = await rejectBox(boxId, rejectionReason)
    if (result.success) {
      toast.success('Box rejected successfully')
      setShowApprovalModal(false)
      setSelectedBox(null)
      setRejectionReason('')
      fetchPendingBoxes()
      fetchAdminData()
    } else {
      toast.error(result.error || 'Failed to reject box')
    }
  }

  const openRejectModal = (box) => {
    setSelectedBox(box)
    setShowApprovalModal(true)
  }

  const closeRejectModal = () => {
    setShowApprovalModal(false)
    setSelectedBox(null)
    setRejectionReason('')
  }

  const handleRequestChanges = async (boxId) => {
    if (!changesReason.trim()) {
      toast.error('Please explain what needs to change.')
      return
    }
    const result = await requestBoxChanges(boxId, changesReason)
    if (result.success) {
      toast.success('Changes requested — the owner has been notified')
      closeChangesModal()
      fetchPendingBoxes()
      fetchAdminData()
    } else {
      toast.error(result.error || 'Failed to request changes')
    }
  }

  const openChangesModal = (box) => {
    setSelectedBox(box)
    setShowChangesModal(true)
  }

  const closeChangesModal = () => {
    setShowChangesModal(false)
    setSelectedBox(null)
    setChangesReason('')
  }

  const totalPlatformRevenue = adminData?.stats?.platform_revenue || 0
  const recentActivity = adminData?.recent_activity || []
  const topCities = adminData?.top_cities || []

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'recently'
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'recently'
    const now = new Date()
    const diffMinutes = Math.floor((now - date) / (1000 * 60))
    if (diffMinutes < 60) return `${diffMinutes} min ago`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours} hours ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const quickActions = [
    { icon: Shield, title: 'User management', text: 'Manage user accounts and permissions', tab: 'users' },
    { icon: CheckCircle, title: 'Box approvals', text: 'Review and approve new facilities', tab: 'approvals', count: pendingBoxes.length },
    { icon: DollarSign, title: 'Revenue reports', text: 'View platform financial analytics', tab: 'reports' },
    { icon: TrendingUp, title: 'Platform analytics', text: 'Comprehensive usage statistics', tab: 'analytics' },
  ]

  const reports = [
    {
      icon: DollarSign, tone: 'text-success', title: 'Revenue report',
      text: 'Detailed financial analytics and commission tracking',
      onClick: () => exportToCsv('revenue-report.csv', bookings.map(b => ({
        id: b.id, user: b.user, box: b.box, owner: b.owner, date: b.date, amount: b.amount, commission: b.commission, status: b.status,
      }))),
    },
    {
      icon: Users, tone: 'text-primary', title: 'User analytics',
      text: 'User behavior, engagement, and growth metrics',
      onClick: () => exportToCsv('user-analytics-report.csv', users.map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, bookings: u.bookings, joinDate: u.joinDate,
      }))),
    },
    {
      icon: Calendar, tone: 'text-turf', title: 'Booking report',
      text: 'Booking trends, patterns, and performance analysis',
      onClick: () => exportToCsv('booking-report.csv', bookings.map(b => ({
        id: b.id, date: b.date, user: b.user, box: b.box, status: b.status,
      }))),
    },
    {
      icon: TrendingUp, tone: 'text-warning', title: 'Performance report',
      text: 'Top boxes and owners by revenue, ranked side by side',
      onClick: () => exportToCsv('performance-report.csv', [
        ...(adminData?.top_boxes_by_revenue || []).map((b) => ({ type: 'Box', name: b.name, revenue: b.revenue, bookings: b.bookings })),
        ...(adminData?.owner_performance_ranking || []).map((o) => ({ type: 'Owner', name: o.owner, revenue: o.revenue, bookings: o.bookings })),
      ]),
    },
    {
      icon: Shield, tone: 'text-danger', title: 'Security report',
      text: 'Requires a security-event/audit log, which doesn’t exist yet — not included in this round',
      disabled: true,
    },
    {
      icon: Eye, tone: 'text-muted-foreground', title: 'Custom report',
      text: 'An open-ended report builder is a separate feature on its own — not included in this round',
      disabled: true,
    },
  ]

  return (
    <div className="min-h-screen bg-background py-8">
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
              <Shield size={28} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Welcome, {user?.first_name || user?.name?.split('@')[0] || user?.name || 'Admin'}
              </h1>
              <p className="mt-1.5 text-muted-foreground text-sm sm:text-base">
                Monitor and manage the entire BookMyBox platform
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Platform admin
            </div>
            {pendingBoxes.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle size={16} />
                {pendingBoxes.length} pending approval{pendingBoxes.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </motion.div>

        {(loadingAdmin || adminError) && (
          <div className="mt-6">
            {loadingAdmin && <Loader text="Loading admin dashboard..." />}
            {adminError && (
              <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
                {adminError}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          <StatTile
            tone="primary"
            icon={<Users size={22} />}
            value={adminData?.stats?.total_users?.toLocaleString() || '0'}
            label={`Total users · ${adminData?.stats?.total_owners || 0} owners`}
            loading={loadingAdmin}
          />
          <StatTile
            tone="success"
            icon={<Calendar size={22} />}
            value={adminData?.stats?.total_bookings?.toLocaleString() || '0'}
            label="Confirmed & completed bookings"
            loading={loadingAdmin}
          />
          <StatTile
            tone="secondary"
            icon={<DollarSign size={22} />}
            value={`₹${parseFloat(adminData?.stats?.platform_revenue || 0).toLocaleString()}`}
            label="Lifetime platform revenue"
            loading={loadingAdmin}
          />
          <StatTile
            tone={pendingBoxes.length > 0 ? 'warning' : 'neutral'}
            icon={<AlertTriangle size={22} />}
            value={pendingBoxes.length}
            label={pendingBoxes.length > 0 ? 'Pending approvals — needs attention' : 'Pending approvals — all clear'}
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          {quickActions.map((action) => (
            <Card
              key={action.title}
              as="button"
              padding="md"
              interactive
              onClick={() => setActiveTab(action.tab)}
              className="text-center w-full"
            >
              <action.icon size={28} className="mx-auto text-primary mb-3" strokeWidth={1.75} />
              <h3 className="font-display font-semibold text-foreground mb-1">{action.title}</h3>
              <p className="text-sm text-muted-foreground">{action.text}</p>
              {action.count > 0 && (
                <span className="inline-block mt-2">
                  <Badge tone="warning">{action.count} pending</Badge>
                </span>
              )}
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2 mt-8 overflow-x-auto no-scrollbar" aria-label="Tabs">
          {TABS.map((tab) => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            const showCount = tab.id === 'approvals' && pendingBoxes.length > 0
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
                <span>{tab.label}{showCount ? ` (${pendingBoxes.length})` : ''}</span>
              </button>
            )
          })}
        </nav>

        <div className="py-8">
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Platform revenue trend</h4>
                  {hasRevenueData ? <Line data={revenueData} options={chartOptions} /> : <ChartEmptyState label="No revenue data yet" />}
                </Card>
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">User growth</h4>
                  {hasUserGrowthData ? <Bar data={userGrowthData} options={chartOptions} /> : <ChartEmptyState label="No user growth data yet" />}
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                <Card padding="md" className="xl:col-span-2">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Recent platform activity</h4>
                  {recentActivity.length > 0 || pendingBoxes.length > 0 ? (
                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                      {recentActivity.map((event) => (
                        <div key={event.id || `${event.type}-${event.time}`} className="flex items-center justify-between gap-3 p-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge tone={ACTIVITY_TONE[event.type] || 'neutral'} variant="solid" className="w-2 h-2 p-0 shrink-0" />
                            <span className="text-sm text-foreground truncate">{event.text}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{formatTimeAgo(event.time)}</span>
                        </div>
                      ))}
                      {pendingBoxes.length > 0 && (
                        <div className="flex items-center justify-between gap-3 p-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge tone="warning" variant="solid" className="w-2 h-2 p-0 shrink-0" />
                            <span className="text-sm text-foreground truncate">
                              {pendingBoxes.length} box{pendingBoxes.length > 1 ? 'es' : ''} pending approval
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setActiveTab('approvals')}>Review now</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No recent activity</div>
                  )}
                </Card>

                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Sports distribution</h4>
                  {hasSportsData ? <Doughnut data={sportsData} options={doughnutOptions} /> : <ChartEmptyState label="No sports distribution data yet" />}
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Revenue summary</h4>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <dt className="text-muted-foreground">Total platform revenue</dt>
                      <dd className="font-medium text-foreground tabular-nums">₹{parseFloat(totalPlatformRevenue).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between items-center">
                      <dt className="text-muted-foreground">Commission</dt>
                      <dd className="font-medium text-foreground tabular-nums">₹{Math.round(adminData?.stats?.total_commission || 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between items-center">
                      <dt className="text-muted-foreground">Confirmed bookings</dt>
                      <dd className="font-medium text-foreground tabular-nums">{adminData?.stats?.total_bookings || 0}</dd>
                    </div>
                    <div className="flex justify-between items-center border-t border-border pt-3">
                      <dt className="font-medium text-foreground">Avg booking value</dt>
                      <dd className="font-display text-lg text-primary tabular-nums">
                        ₹{adminData?.stats?.total_bookings
                          ? Math.round(parseFloat(totalPlatformRevenue) / adminData.stats.total_bookings).toLocaleString()
                          : 0}
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Top performing cities</h4>
                  <div className="space-y-3">
                    {topCities.length > 0 ? topCities.map((city) => (
                      <div key={city.city} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{city.city}</span>
                          <span className="font-medium text-muted-foreground tabular-nums">{city.bookings} bookings</span>
                        </div>
                        <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-500"
                            style={{ width: `${city.percentage}%` }}
                          />
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-muted-foreground">No city data available</div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Box approvals */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">Box approval queue</h3>
                <span className="text-sm text-muted-foreground">
                  {pendingBoxes.length} pending approval{pendingBoxes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {pendingBoxes.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <CheckCircle size={56} className="mx-auto text-success mb-4" />
                  <h3 className="text-xl font-display font-semibold text-foreground mb-2">All caught up</h3>
                  <p className="text-muted-foreground">No boxes pending approval at the moment.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {pendingBoxes.map((box) => (
                    <Card key={box.id} padding="none" className="overflow-hidden flex flex-col">
                      <div className="relative">
                        <img src={box.image} alt={box.name} className="w-full h-48 object-cover" />
                        <div className="absolute top-4 right-4">
                          <Badge tone="warning" variant="solid" size="md">
                            <Clock size={14} />
                            Pending
                          </Badge>
                        </div>
                      </div>

                      <div className="p-6 flex flex-col flex-1">
                        <div className="mb-4">
                          <h4 className="font-display font-semibold text-lg text-foreground">{box.name}</h4>
                          <p className="text-sm text-muted-foreground">by {box.owner}</p>
                        </div>

                        <div className="space-y-3 mb-5 text-sm">
                          <div>
                            <p className="text-muted-foreground">Sports available</p>
                            <p className="font-medium text-foreground">{box.sports?.join(', ')}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-muted-foreground">Location</p>
                              <p className="font-medium text-foreground">{box.location}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Price / hour</p>
                              <p className="font-medium text-foreground tabular-nums">₹{box.price}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Capacity</p>
                              <p className="font-medium text-foreground">{box.capacity} players</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Submitted</p>
                              <p className="font-medium text-foreground">{formatDate(box.submitted_at)}</p>
                            </div>
                          </div>

                          <div>
                            <p className="text-muted-foreground">Description</p>
                            <p className="text-foreground">{box.description}</p>
                          </div>

                          {box.amenities?.length > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-1.5">Amenities</p>
                              <div className="flex flex-wrap gap-1.5">
                                {box.amenities.map((amenity) => (
                                  <Badge key={amenity} tone="neutral">{amenity}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-3 mt-auto">
                          <Button variant="outline" fullWidth icon={<X size={16} />} onClick={() => openRejectModal(box)}>
                            Reject
                          </Button>
                          <Button variant="outline" fullWidth icon={<AlertTriangle size={16} />} onClick={() => openChangesModal(box)}>
                            Request changes
                          </Button>
                          <Button fullWidth icon={<CheckCircle size={16} />} onClick={() => handleApproveBox(box.id)}>
                            Approve
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Users */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">User management</h3>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <div className="w-full sm:w-64">
                    <Input
                      leadingIcon={<Search size={16} />}
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="">All roles</option>
                    <option value="user">User</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                  </Select>
                </div>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['User', 'Email', 'Role', 'Status', 'Join date', 'Actions'].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {usersLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">Loading users...</td>
                        </tr>
                      ) : usersResult.results.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">
                            {debouncedUserSearch || roleFilter ? 'No users match your filters' : 'No users yet'}
                          </td>
                        </tr>
                      ) : usersResult.results.map((u) => {
                        const displayName = u.full_name || u.email
                        const roleLabel = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'User'
                        const statusLabel = u.is_active ? 'Active' : 'Inactive'
                        const isSelf = u.id === user?.id
                        return (
                          <tr key={u.id} className="hover:bg-elevated/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                  {initial(displayName)}
                                </div>
                                <span className="font-medium text-foreground whitespace-nowrap">{displayName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{u.email}</td>
                            <td className="py-3 px-4"><Badge tone={ROLE_TONE[roleLabel] || 'neutral'}>{roleLabel}</Badge></td>
                            <td className="py-3 px-4"><Badge tone={USER_STATUS_TONE[statusLabel] || 'neutral'}>{statusLabel}</Badge></td>
                            <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDate(u.date_joined)}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openViewUserModal(u)}
                                  title="View user"
                                  aria-label="View user"
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => openEditUserModal(u)}
                                  disabled={isSelf}
                                  title={isSelf ? "You can't edit your own role/status" : 'Edit role/status'}
                                  aria-label="Edit role and status"
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  <Edit size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={usersPage}
                  pageSize={USERS_PAGE_SIZE}
                  count={usersResult.count}
                  onPageChange={setUsersPage}
                />
              </Card>
            </div>
          )}

          {/* Bookings */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">Booking management</h3>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
                  <div className="w-full sm:w-56">
                    <Input
                      leadingIcon={<Search size={16} />}
                      placeholder="Search bookings..."
                      value={bookingSearch}
                      onChange={(e) => setBookingSearch(e.target.value)}
                    />
                  </div>
                  <Select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)}>
                    <option value="">All status</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </Select>
                  <input
                    type="date"
                    value={bookingDateFrom}
                    onChange={(e) => setBookingDateFrom(e.target.value)}
                    aria-label="From date"
                    className="px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                  />
                  <input
                    type="date"
                    value={bookingDateTo}
                    onChange={(e) => setBookingDateTo(e.target.value)}
                    aria-label="To date"
                    className="px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                  />
                </div>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['User', 'Box', 'Owner', 'Date', 'Amount', 'Commission', 'Status'].map((h) => (
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
                            {debouncedBookingSearch || bookingStatusFilter || bookingDateFrom || bookingDateTo
                              ? 'No bookings match your filters' : 'No bookings yet'}
                          </td>
                        </tr>
                      ) : bookingsResult.results.map((booking) => (
                        <tr key={booking.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                {initial(booking.booking_source === 'owner_manual' ? (booking.customer_name || 'Walk-in') : booking.user_name)}
                              </div>
                              <div className="min-w-0">
                                <span className="text-foreground whitespace-nowrap block">
                                  {booking.booking_source === 'owner_manual' ? (booking.customer_name || 'Walk-in') : booking.user_name}
                                </span>
                                {booking.booking_source === 'owner_manual' && <Badge tone="secondary" size="sm">Walk-in</Badge>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{booking.box_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{booking.owner_email}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{booking.date}</td>
                          <td className="py-3 px-4 font-medium text-foreground tabular-nums">₹{booking.total_amount}</td>
                          <td className="py-3 px-4 font-medium text-success tabular-nums">₹{booking.commission}</td>
                          <td className="py-3 px-4">
                            <Badge tone={BOOKING_STATUS_TONE[booking.booking_status] || 'neutral'}>{booking.booking_status}</Badge>
                          </td>
                        </tr>
                      ))}
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

          {/* Reviews */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">Review moderation</h3>
                <div className="w-full sm:w-64">
                  <Input
                    leadingIcon={<Search size={16} />}
                    placeholder="Search reviews..."
                    value={reviewSearch}
                    onChange={(e) => setReviewSearch(e.target.value)}
                  />
                </div>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Box', 'Reviewer', 'Rating', 'Comment', 'Date', ''].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reviewsLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">Loading reviews...</td>
                        </tr>
                      ) : reviewsResult.results.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">
                            {debouncedReviewSearch ? 'No reviews match your search' : 'No reviews yet'}
                          </td>
                        </tr>
                      ) : reviewsResult.results.map((review) => (
                        <tr key={review.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4 text-foreground whitespace-nowrap">{review.box_name}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{review.user_name}</td>
                          <td className="py-3 px-4"><RatingStars rating={review.rating} /></td>
                          <td className="py-3 px-4 text-muted-foreground max-w-xs truncate" title={review.comment}>{review.comment}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{review.date}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setReviewToDelete(review)}
                              title="Delete review"
                              aria-label="Delete review"
                              className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={reviewsPage}
                  pageSize={REVIEWS_PAGE_SIZE}
                  count={reviewsResult.count}
                  onPageChange={setReviewsPage}
                />
              </Card>
            </div>
          )}

          {/* Payouts */}
          {activeTab === 'payouts' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-display font-semibold text-foreground">Owner payouts</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Net revenue (after each owner&apos;s resolved commission — see the Commission tab) minus what&apos;s already been paid out.
                  Recording a payout here is a manual ledger entry — settle the actual transfer outside the app first.
                  Set a schedule to have this recorded automatically instead.
                </p>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Owner', 'Gross revenue', 'Commission', 'Net revenue', 'Paid out', 'Balance due', 'Schedule', ''].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payoutsLoading ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-muted-foreground">Loading balances...</td>
                        </tr>
                      ) : payoutsBalance.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-muted-foreground">No owners yet</td>
                        </tr>
                      ) : payoutsBalance.map((row) => (
                        <tr key={row.owner_id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                {initial(row.owner_name)}
                              </div>
                              <span className="font-medium text-foreground whitespace-nowrap">{row.owner_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground tabular-nums">₹{row.gross_revenue.toLocaleString()}</td>
                          <td className="py-3 px-4 text-muted-foreground tabular-nums">₹{row.commission.toLocaleString()}</td>
                          <td className="py-3 px-4 text-foreground font-medium tabular-nums">₹{row.net_revenue.toLocaleString()}</td>
                          <td className="py-3 px-4 text-success tabular-nums">₹{row.total_paid.toLocaleString()}</td>
                          <td className="py-3 px-4 font-medium tabular-nums">
                            <span className={row.balance_due > 0 ? 'text-warning' : 'text-muted-foreground'}>
                              ₹{row.balance_due.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                            {payoutSchedules[row.owner_id]
                              ? payoutSchedules[row.owner_id].frequency.charAt(0).toUpperCase() + payoutSchedules[row.owner_id].frequency.slice(1)
                              : 'Not set'}
                          </td>
                          <td className="py-3 px-4 flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => openRecordPayoutModal(row)}>
                              Record payout
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openScheduleModal(row)}>
                              Schedule
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card padding="none" className="overflow-hidden">
                <div className="px-6 pt-5 pb-1">
                  <h3 className="text-lg font-display font-semibold text-foreground">Payout history</h3>
                  <p className="text-sm text-muted-foreground mt-1">Every payout across all owners — manual and automatic.</p>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Owner', 'Amount', 'Source', 'Note', 'Date'].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payoutHistoryLoading ? (
                        <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading history...</td></tr>
                      ) : payoutHistory.results.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No payouts recorded yet</td></tr>
                      ) : payoutHistory.results.map((payout) => (
                        <tr key={payout.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4 text-foreground whitespace-nowrap">{payout.owner_email}</td>
                          <td className="py-3 px-4 font-medium text-foreground tabular-nums">₹{payout.amount}</td>
                          <td className="py-3 px-4">
                            <Badge tone={payout.source === 'scheduled' ? 'secondary' : 'neutral'}>
                              {payout.source === 'scheduled' ? 'Scheduled' : 'Manual'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{payout.note || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(payout.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={payoutHistoryPage}
                  pageSize={PAYOUTS_PAGE_SIZE}
                  count={payoutHistory.count}
                  onPageChange={setPayoutHistoryPage}
                />
              </Card>
            </div>
          )}

          {/* Coupons */}
          {activeTab === 'coupons' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">Discount coupons</h3>
                <Button onClick={() => setShowCreateCouponModal(true)} icon={<Plus size={16} />}>
                  New coupon
                </Button>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['Code', 'Discount', 'Uses', 'Valid until', 'Status', ''].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {couponsLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">Loading coupons...</td>
                        </tr>
                      ) : coupons.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">No coupons yet</td>
                        </tr>
                      ) : coupons.map((c) => (
                        <tr key={c.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-foreground whitespace-nowrap">{c.code}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {c.discount_type === 'percent' ? `${Number(c.value)}% off` : `₹${Number(c.value)} off`}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground tabular-nums">
                            {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{c.valid_until || 'No expiry'}</td>
                          <td className="py-3 px-4">
                            <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Button variant="outline" size="sm" onClick={() => handleToggleCouponActive(c)}>
                              {c.active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'rewards' && <AdminRewardsTab />}

          {activeTab === 'commission' && <AdminCommissionTab />}

          {/* Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-display font-semibold text-foreground">Platform analytics</h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Peak booking hours</h4>
                  {(adminData?.peak_booking_hours?.data || []).length > 0 ? (
                    <PeakHoursChart data={{ labels: adminData.peak_booking_hours.labels, values: adminData.peak_booking_hours.data }} />
                  ) : (
                    <ChartEmptyState label="No booking-hour data yet" />
                  )}
                </Card>
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Growth &amp; reliability</h4>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Revenue growth (MoM)', `${adminData?.stats?.mom_revenue_growth_pct >= 0 ? '+' : ''}${adminData?.stats?.mom_revenue_growth_pct ?? 0}%`],
                      ['Bookings growth (MoM)', `${adminData?.stats?.mom_bookings_growth_pct >= 0 ? '+' : ''}${adminData?.stats?.mom_bookings_growth_pct ?? 0}%`],
                      ['Cancellation rate', `${adminData?.stats?.cancellation_rate_pct ?? 0}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Top boxes by revenue</h4>
                  <div className="space-y-3">
                    {(adminData?.top_boxes_by_revenue || []).length > 0 ? adminData.top_boxes_by_revenue.map((box, i) => {
                      const max = adminData.top_boxes_by_revenue[0].revenue || 1
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
                      <div className="text-center py-8 text-muted-foreground">No box revenue data available</div>
                    )}
                  </div>
                </Card>

                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Top owners by revenue</h4>
                  <div className="space-y-3">
                    {(adminData?.owner_performance_ranking || []).length > 0 ? adminData.owner_performance_ranking.map((owner, i) => {
                      const max = adminData.owner_performance_ranking[0].revenue || 1
                      return (
                        <div key={`${owner.owner}-${i}`} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-foreground">{owner.owner}</span>
                            <span className="font-medium text-muted-foreground tabular-nums">₹{owner.revenue.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                            <div className="bg-turf h-full rounded-full transition-all duration-500" style={{ width: `${(owner.revenue / max) * 100}%` }} />
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="text-center py-8 text-muted-foreground">No owner revenue data available</div>
                    )}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Platform metrics</h4>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Total users', users.length],
                      ['Active boxes', boxes.filter(b => b.status === 'Approved' || b.status === 'approved').length],
                      ['Total bookings', bookings.length],
                      ['Platform commission', `₹${Math.round(parseFloat(totalPlatformRevenue) * 0.1).toLocaleString()}`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>

                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Booking trends</h4>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Confirmed / completed', bookings.filter(b => b.status === 'Confirmed' || b.status === 'Completed').length],
                      ['Cancelled', bookings.filter(b => b.status === 'Cancelled').length],
                      ['Average booking value', `₹${bookings.length
                        ? Math.round(bookings.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0) / bookings.length).toLocaleString()
                        : 0}`],
                      ['Total commission', `₹${Math.round(bookings.reduce((sum, b) => sum + parseFloat(b.commission || 0), 0)).toLocaleString()}`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>

                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Box status</h4>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Approved', adminData?.stats?.approved_boxes_count || 0],
                      ['Pending', adminData?.stats?.pending_boxes_count || 0],
                      ['Rejected', adminData?.stats?.rejected_boxes_count || 0],
                      ['Total owners', adminData?.stats?.total_owners || 0],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </div>
            </div>
          )}

          {/* Reports */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-display font-semibold text-foreground">Platform reports</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {reports.map((report) => (
                  <Card key={report.title} padding="md" className={`flex flex-col ${report.disabled ? 'opacity-60' : ''}`}>
                    <report.icon size={28} className={`mb-4 ${report.tone}`} strokeWidth={1.75} />
                    <h4 className="font-display font-semibold text-foreground mb-2">{report.title}</h4>
                    <p className="text-sm text-muted-foreground mb-5 flex-1">{report.text}</p>
                    <Button
                      fullWidth
                      onClick={report.onClick}
                      disabled={report.disabled}
                      title={report.disabled ? 'Coming soon' : undefined}
                    >
                      {report.disabled ? 'Coming soon' : 'Generate report'}
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Modal — Modal manages its own AnimatePresence internally,
          so it renders unconditionally rather than behind a && guard. */}
      <Modal
        isOpen={showApprovalModal}
        onClose={closeRejectModal}
        title="Reject box application"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeRejectModal}>Cancel</Button>
            <Button variant="danger" onClick={() => handleRejectBox(selectedBox?.id)}>Reject application</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to reject the application for{' '}
            <span className="font-semibold text-foreground">{selectedBox?.name}</span>?
          </p>

          <div className="space-y-1.5">
            <label htmlFor="rejection-reason" className="block text-sm font-medium text-foreground">
              Rejection reason (optional)
            </label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="Provide a reason for rejection to help the owner improve their application..."
            />
          </div>
        </div>
      </Modal>

      {/* Request Changes Modal — the middle ground between approve/reject:
          the box goes back to the owner with required notes instead of
          being killed outright. */}
      <Modal
        isOpen={showChangesModal}
        onClose={closeChangesModal}
        title="Request changes"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeChangesModal}>Cancel</Button>
            <Button variant="primary" onClick={() => handleRequestChanges(selectedBox?.id)}>Send request</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Tell the owner what needs to change on{' '}
            <span className="font-semibold text-foreground">{selectedBox?.name}</span> before it can be approved.
            They&rsquo;ll be notified, and the listing will re-enter your approval queue once they update it.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="changes-reason" className="block text-sm font-medium text-foreground">
              What needs to change
            </label>
            <textarea
              id="changes-reason"
              value={changesReason}
              onChange={(e) => setChangesReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="e.g. Please add clearer photos of the facility and confirm the opening hours..."
            />
          </div>
        </div>
      </Modal>

      {/* View User Modal — read-only, no extra fetch needed since the row's
          already-fetched data has everything this shows. */}
      <Modal
        isOpen={showUserViewModal}
        onClose={() => { setShowUserViewModal(false); setEditingUser(null) }}
        title="User details"
        size="sm"
      >
        {editingUser && (
          <dl className="space-y-3 text-sm">
            {[
              ['Name', editingUser.full_name || editingUser.email],
              ['Email', editingUser.email],
              ['Phone', editingUser.phone || '—'],
              ['Role', editingUser.role],
              ['Status', editingUser.is_active ? 'Active' : 'Inactive'],
              ['Verified', editingUser.is_verified ? 'Yes' : 'No'],
              ['Location', editingUser.location || '—'],
              ['Business name', editingUser.business_name || '—'],
              ['Joined', formatDate(editingUser.date_joined)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium text-foreground text-right">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      {/* Edit User Modal — role + suspend/reactivate. */}
      <Modal
        isOpen={showUserEditModal}
        onClose={() => { setShowUserEditModal(false); setEditingUser(null) }}
        title="Edit user"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowUserEditModal(false); setEditingUser(null) }}>Cancel</Button>
            <Button onClick={handleSaveUser} loading={savingUser}>Save changes</Button>
          </>
        )}
      >
        {editingUser && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Editing <span className="font-medium text-foreground">{editingUser.full_name || editingUser.email}</span>
            </p>
            <Select label="Role" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              <option value="user">User</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
            </Select>
            <Select
              label="Status"
              value={editActive ? 'active' : 'suspended'}
              onChange={(e) => setEditActive(e.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended (cannot log in)</option>
            </Select>
          </div>
        )}
      </Modal>

      {/* Delete Review Modal */}
      <Modal
        isOpen={!!reviewToDelete}
        onClose={() => setReviewToDelete(null)}
        title="Delete review"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setReviewToDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleConfirmDeleteReview} loading={deletingReview}>Delete review</Button>
          </>
        )}
      >
        {reviewToDelete && (
          <p className="text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{reviewToDelete.user_name}</span>&apos;s review on{' '}
            <span className="font-semibold text-foreground">{reviewToDelete.box_name}</span>? This cannot be undone,
            and the box&apos;s average rating will be recalculated.
          </p>
        )}
      </Modal>

      {/* Record Payout Modal */}
      <Modal
        isOpen={!!payoutTarget}
        onClose={() => setPayoutTarget(null)}
        title="Record a payout"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setPayoutTarget(null)}>Cancel</Button>
            <Button onClick={handleRecordPayout} loading={recordingPayout} disabled={!payoutAmount || Number(payoutAmount) <= 0}>
              Record payout
            </Button>
          </>
        )}
      >
        {payoutTarget && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Recording a payout to <span className="font-medium text-foreground">{payoutTarget.owner_name}</span>.
              Current balance due: <span className="font-medium text-foreground">₹{payoutTarget.balance_due.toLocaleString()}</span>.
            </p>
            <Input
              label="Amount (₹)"
              type="number"
              min="0.01"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder={String(payoutTarget.balance_due)}
            />
            <div className="space-y-1.5">
              <label htmlFor="payout-note" className="block text-sm font-medium text-foreground">Note (optional)</label>
              <textarea
                id="payout-note"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
                placeholder="e.g. Bank transfer, ref #12345"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Payout Schedule Modal */}
      <Modal
        isOpen={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        title="Payout schedule"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setScheduleTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveSchedule} loading={savingSchedule}>Save schedule</Button>
          </>
        )}
      >
        {scheduleTarget && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Set how often <span className="font-medium text-foreground">{scheduleTarget.owner_name}</span> is
              automatically paid out. This records a ledger entry each cycle — the actual transfer still happens outside the app.
            </p>
            <Select
              label="Frequency"
              value={scheduleForm.frequency}
              onChange={(e) => setScheduleForm((f) => ({ ...f, frequency: e.target.value }))}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </Select>
            {scheduleForm.frequency === 'monthly' ? (
              <Input
                label="Day of month"
                type="number"
                min="1"
                max="28"
                value={scheduleForm.day_of_month}
                onChange={(e) => setScheduleForm((f) => ({ ...f, day_of_month: e.target.value }))}
              />
            ) : (
              <Select
                label="Day of week"
                value={scheduleForm.day_of_week}
                onChange={(e) => setScheduleForm((f) => ({ ...f, day_of_week: e.target.value }))}
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </Select>
            )}
          </div>
        )}
      </Modal>

      {/* Create Coupon Modal */}
      <Modal
        isOpen={showCreateCouponModal}
        onClose={() => setShowCreateCouponModal(false)}
        title="New coupon"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowCreateCouponModal(false)}>Cancel</Button>
            <Button onClick={handleCreateCoupon} loading={creatingCoupon} disabled={!newCoupon.code.trim() || !newCoupon.value}>
              Create coupon
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="Code"
            value={newCoupon.code}
            onChange={(e) => setNewCoupon((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
            placeholder="SUMMER25"
          />
          <Select
            label="Discount type"
            value={newCoupon.discount_type}
            onChange={(e) => setNewCoupon((c) => ({ ...c, discount_type: e.target.value }))}
          >
            <option value="percent">Percent off</option>
            <option value="flat">Flat amount off (₹)</option>
          </Select>
          <Input
            label={newCoupon.discount_type === 'percent' ? 'Value (%)' : 'Value (₹)'}
            type="number"
            min="0"
            value={newCoupon.value}
            onChange={(e) => setNewCoupon((c) => ({ ...c, value: e.target.value }))}
            placeholder={newCoupon.discount_type === 'percent' ? '10' : '100'}
          />
          <Input
            label="Max uses (optional)"
            type="number"
            min="1"
            value={newCoupon.max_uses}
            onChange={(e) => setNewCoupon((c) => ({ ...c, max_uses: e.target.value }))}
            placeholder="Unlimited"
          />
        </div>
      </Modal>
    </div>
  )
}

export default AdminDashboard
