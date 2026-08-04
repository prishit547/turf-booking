import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Users, Calendar, DollarSign, TrendingUp, Search, Edit, Trash2, Eye, Shield, AlertTriangle, CheckCircle, X, Clock, BarChart3, FileText } from 'lucide-react'
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
import { Button, Card, Badge, Modal, Loader, StatTile, Input, Select } from '../components/ui'
import { useChartTheme } from '../utils/chartTheme'

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
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState('')
  const [selectedBox, setSelectedBox] = useState(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [adminData, setAdminData] = useState(null)
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const { user } = useAuth()
  const { pendingBoxes, fetchPendingBoxes, approveBox, rejectBox } = useBox()
  const chartTheme = useChartTheme()

  useEffect(() => {
    fetchPendingBoxes()
  }, [fetchPendingBoxes])

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

  const totalPlatformRevenue = adminData?.stats?.platform_revenue || 0
  const filteredUsers = users.filter(u =>
    (u.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.role?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  )
  const filteredBookings = bookings.filter((b) => {
    const q = bookingSearch.toLowerCase()
    const matchesSearch = !q
      || (b.user?.toLowerCase() || '').includes(q)
      || (b.box?.toLowerCase() || '').includes(q)
      || (b.owner?.toLowerCase() || '').includes(q)
    const matchesStatus = !bookingStatusFilter || b.status === bookingStatusFilter
    return matchesSearch && matchesStatus
  })
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
    { icon: TrendingUp, tone: 'text-warning', title: 'Performance report', text: 'Platform performance and operational metrics', disabled: true },
    { icon: Shield, tone: 'text-danger', title: 'Security report', text: 'Security incidents, user activity, and system logs', disabled: true },
    { icon: Eye, tone: 'text-muted-foreground', title: 'Custom report', text: 'Create custom reports with specific parameters', disabled: true },
  ]

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
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
                      <dt className="text-muted-foreground">Commission (10%)</dt>
                      <dd className="font-medium text-foreground tabular-nums">₹{Math.round(parseFloat(totalPlatformRevenue) * 0.1).toLocaleString()}</dd>
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

                        <div className="flex gap-3 mt-auto">
                          <Button variant="outline" fullWidth icon={<X size={16} />} onClick={() => openRejectModal(box)}>
                            Reject
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
                <div className="w-full sm:w-72">
                  <Input
                    leadingIcon={<Search size={16} />}
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-elevated">
                      <tr>
                        {['User', 'Email', 'Role', 'Status', 'Bookings', 'Join date', 'Actions'].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-muted-foreground">
                            {users.length === 0 ? 'No users yet' : 'No users match your search'}
                          </td>
                        </tr>
                      ) : filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                {initial(u.name)}
                              </div>
                              <span className="font-medium text-foreground whitespace-nowrap">{u.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{u.email}</td>
                          <td className="py-3 px-4"><Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge></td>
                          <td className="py-3 px-4"><Badge tone={USER_STATUS_TONE[u.status] || 'neutral'}>{u.status}</Badge></td>
                          <td className="py-3 px-4 text-muted-foreground tabular-nums">{u.bookings}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDate(u.joinDate)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {[
                                { Icon: Eye, label: 'View user' },
                                { Icon: Edit, label: 'Edit user' },
                                { Icon: Trash2, label: 'Delete user' },
                              ].map(({ Icon, label }) => (
                                <button
                                  key={label}
                                  disabled
                                  title={`${label} — coming soon`}
                                  aria-label={`${label} — coming soon`}
                                  className="p-1.5 rounded-md text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Icon size={16} />
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Bookings */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-2xl font-display font-semibold text-foreground">Booking management</h3>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <div className="w-full sm:w-64">
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
                      {filteredBookings.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-muted-foreground">
                            {bookings.length === 0 ? 'No bookings yet' : 'No bookings match your filters'}
                          </td>
                        </tr>
                      ) : filteredBookings.map((booking) => (
                        <tr key={booking.id} className="hover:bg-elevated/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                                {initial(booking.user)}
                              </div>
                              <span className="text-foreground whitespace-nowrap">{booking.user}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{booking.box}</td>
                          <td className="py-3 px-4 text-muted-foreground">{booking.owner}</td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{booking.date}</td>
                          <td className="py-3 px-4 font-medium text-foreground tabular-nums">₹{booking.amount}</td>
                          <td className="py-3 px-4 font-medium text-success tabular-nums">
                            ₹{Math.round(booking.amount * 0.1)}
                          </td>
                          <td className="py-3 px-4">
                            <Badge tone={BOOKING_STATUS_TONE[booking.status] || 'neutral'}>{booking.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-display font-semibold text-foreground">Platform analytics</h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">Revenue growth</h4>
                  {hasRevenueData ? <Line data={revenueData} options={chartOptions} /> : <ChartEmptyState label="No revenue data yet" />}
                </Card>
                <Card padding="md">
                  <h4 className="font-display font-semibold text-lg mb-4 text-foreground">User acquisition</h4>
                  {hasUserGrowthData ? <Bar data={userGrowthData} options={chartOptions} /> : <ChartEmptyState label="No user growth data yet" />}
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
                      ['Approved', boxes.filter(b => b.status === 'Approved' || b.status === 'approved').length],
                      ['Pending', boxes.filter(b => b.status === 'Pending' || b.status === 'pending').length],
                      ['Rejected', boxes.filter(b => b.status === 'Rejected' || b.status === 'rejected').length],
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
    </div>
  )
}

export default AdminDashboard
