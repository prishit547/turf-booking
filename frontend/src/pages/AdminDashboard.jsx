import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Users, Calendar, DollarSign, TrendingUp, Search, Filter, Edit, Trash2, Eye, Shield, AlertTriangle, CheckCircle, X, Clock } from 'lucide-react'
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
import Modal from '../components/common/Modal'
import Loader from '../components/common/Loader'

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
  <div className="flex items-center justify-center h-48 text-sm text-gray-400 dark:text-gray-500">
    {label}
  </div>
)

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
  const [selectedBox, setSelectedBox] = useState(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [adminData, setAdminData] = useState(null)
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const { user } = useAuth()
  const { pendingBoxes, fetchPendingBoxes, approveBox, rejectBox } = useBox()

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

  const stats = [
    {
      title: 'Total Users',
      value: adminData?.stats?.total_users?.toLocaleString() || '0',
      change: `${adminData?.stats?.total_owners || 0} owners`,
      icon: Users,
      color: 'bg-blue-500'
    },
    {
      title: 'Total Bookings',
      value: adminData?.stats?.total_bookings?.toLocaleString() || '0',
      change: 'Confirmed & completed',
      icon: Calendar,
      color: 'bg-green-500'
    },
    {
      title: 'Platform Revenue',
      value: `₹${parseFloat(adminData?.stats?.platform_revenue || 0).toLocaleString()}`,
      change: 'Lifetime revenue',
      icon: DollarSign,
      color: 'bg-purple-500'
    },
    {
      title: 'Pending Approvals',
      value: pendingBoxes.length,
      change: pendingBoxes.length > 0 ? 'Needs attention' : 'All clear',
      icon: AlertTriangle,
      color: pendingBoxes.length > 0 ? 'bg-orange-500' : 'bg-green-500'
    }
  ]

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
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
        backgroundColor: [
          '#10B981',
          '#3B82F6',
          '#F59E0B',
          '#EF4444',
          '#8B5CF6',
          '#06B6D4',
        ],
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
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 4,
      },
    ],
  }
  const hasUserGrowthData = (adminData?.user_growth_chart?.data || []).some((v) => v > 0)

  const users = adminData?.users || []

  const boxes = adminData?.boxes || adminData?.boxes_overview || []

  const bookings = adminData?.bookings || []

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'approvals', label: `Box Approvals ${pendingBoxes.length > 0 ? `(${pendingBoxes.length})` : ''}` },
    { id: 'users', label: 'Users' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'reports', label: 'Reports' }
  ]

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      }
    }
  }

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
      },
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

  const totalPlatformRevenue = adminData?.stats?.platform_revenue || 0
  const filteredUsers = users.filter(user =>
    (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.role?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  )
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

  const getActivityColor = (type) => {
    switch (type) {
      case 'approval': return 'bg-yellow-500'
      case 'user': return 'bg-blue-500'
      case 'booking': return 'bg-green-500'
      default: return 'bg-purple-500'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container-max section-padding">
        {(loadingAdmin || adminError) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            {loadingAdmin && <Loader text="Loading admin dashboard..." />}
            {adminError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {adminError}
              </div>
            )}
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome, {user?.first_name || user?.name?.split('@')[0] || user?.name || 'Admin'}! 🛡️
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Monitor and manage the entire BookMyBox platform</p>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border dark:border-gray-700">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-sm font-medium dark:text-gray-200">Platform Admin</span>
                </div>
              </div>
              {pendingBoxes.length > 0 && (
                <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle size={16} className="text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">
                      {pendingBoxes.length} pending approval{pendingBoxes.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="card p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className={`text-sm ${stat.title === 'Pending Approvals' && pendingBoxes.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {stat.change}
                  </p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <stat.icon size={24} className="text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
        >
          <div className="card p-6 text-center hover:shadow-lg transition-shadow cursor-pointer">
            <Shield size={32} className="mx-auto text-blue-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">User Management</h3>
            <p className="text-sm text-gray-600">Manage user accounts and permissions</p>
          </div>
          
          <div className="card p-6 text-center hover:shadow-lg transition-shadow cursor-pointer">
            <CheckCircle size={32} className="mx-auto text-green-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Box Approvals</h3>
            <p className="text-sm text-gray-600">Review and approve new facilities</p>
            {pendingBoxes.length > 0 && (
              <span className="inline-block mt-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">
                {pendingBoxes.length} pending
              </span>
            )}
          </div>
          
          <div className="card p-6 text-center hover:shadow-lg transition-shadow cursor-pointer">
            <DollarSign size={32} className="mx-auto text-purple-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Revenue Reports</h3>
            <p className="text-sm text-gray-600">View platform financial analytics</p>
          </div>
          
          <div className="card p-6 text-center hover:shadow-lg transition-shadow cursor-pointer">
            <TrendingUp size={32} className="mx-auto text-orange-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">Platform Analytics</h3>
            <p className="text-sm text-gray-600">Comprehensive usage statistics</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card mb-8"
        >
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Platform Revenue Trend</h4>
                    {hasRevenueData ? <Line data={revenueData} options={chartOptions} /> : <ChartEmptyState label="No revenue data yet" />}
                  </div>
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">User Growth</h4>
                    {hasUserGrowthData ? <Bar data={userGrowthData} options={chartOptions} /> : <ChartEmptyState label="No user growth data yet" />}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <h4 className="font-medium mb-4">Recent Platform Activity</h4>
                    <div className="space-y-3">
                      {recentActivity.length > 0 ? recentActivity.map((event) => (
                        <div key={event.id || `${event.type}-${event.time}`} className={`flex items-center justify-between py-3 px-4 rounded-lg border ${
                          event.type === 'approval' ? 'bg-yellow-50 border-yellow-200' :
                          event.type === 'user' ? 'bg-blue-50 border-blue-200' :
                          event.type === 'booking' ? 'bg-green-50 border-green-200' :
                          'bg-purple-50 border-purple-200'
                        }`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${getActivityColor(event.type)}`}></div>
                            <span className="text-sm">{event.text}</span>
                          </div>
                          <span className={`text-xs ${
                            event.type === 'approval' ? 'text-yellow-700' :
                            event.type === 'user' ? 'text-blue-700' :
                            event.type === 'booking' ? 'text-green-700' :
                            'text-purple-700'
                          }`}>{formatTimeAgo(event.time)}</span>
                        </div>
                      )) : (
                        <div className="text-center py-8 text-gray-500">No recent activity</div>
                      )}
                      {pendingBoxes.length > 0 && (
                        <div className="flex items-center justify-between py-3 px-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                            <span className="text-sm">{pendingBoxes.length} box{pendingBoxes.length > 1 ? 'es' : ''} pending approval</span>
                          </div>
                          <button
                            onClick={() => setActiveTab('approvals')}
                            className="text-xs text-yellow-700 hover:text-yellow-800 font-medium"
                          >
                            Review Now
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Sports Distribution</h4>
                    {hasSportsData ? <Doughnut data={sportsData} options={doughnutOptions} /> : <ChartEmptyState label="No sports distribution data yet" />}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Revenue Summary</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Platform Revenue</span>
                        <span className="font-medium">₹{parseFloat(totalPlatformRevenue).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Commission (10%)</span>
                        <span className="font-medium">₹{Math.round(parseFloat(totalPlatformRevenue) * 0.1).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Confirmed Bookings</span>
                        <span className="font-medium">{adminData?.stats?.total_bookings || 0}</span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-sm font-medium">Avg Booking Value</span>
                        <span className="font-bold text-primary-600">
                          ₹{adminData?.stats?.total_bookings
                            ? Math.round(parseFloat(totalPlatformRevenue) / adminData.stats.total_bookings).toLocaleString()
                            : 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Top Performing Cities</h4>
                    <div className="space-y-3">
                      {topCities.length > 0 ? topCities.map((city) => (
                        <div key={city.city} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{city.city}</span>
                            <span className="font-medium">{city.bookings} bookings</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${city.percentage}%` }}
                            />
                          </div>
                        </div>
                      )) : (
                        <div className="text-center py-8 text-gray-500">No city data available</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Box Approvals Tab */}
            {activeTab === 'approvals' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Box Approval Queue</h3>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">
                      {pendingBoxes.length} pending approval{pendingBoxes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {pendingBoxes.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h3>
                    <p className="text-gray-600">No boxes pending approval at the moment.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {pendingBoxes.map((box) => (
                      <motion.div
                        key={box.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="card overflow-hidden"
                      >
                        <div className="relative">
                          <img
                            src={box.image}
                            alt={box.name}
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-300 px-2 py-1 rounded-lg flex items-center space-x-1">
                            <Clock size={14} className="text-yellow-600" />
                            <span className="text-xs font-medium text-yellow-800">Pending</span>
                          </div>
                        </div>
                        
                        <div className="p-6">
                          <div className="mb-4">
                            <h4 className="font-semibold text-gray-900 text-lg">{box.name}</h4>
                            <p className="text-sm text-gray-600">by {box.owner}</p>
                          </div>

                          <div className="space-y-3 mb-4">
                            <div>
                              <p className="text-sm text-gray-600">Sports Available:</p>
                              <p className="font-medium">{box.sports?.join(', ')}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-gray-600">Location:</p>
                                <p className="font-medium">{box.location}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Price/Hour:</p>
                                <p className="font-medium">₹{box.price}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Capacity:</p>
                                <p className="font-medium">{box.capacity} players</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Submitted:</p>
                                <p className="font-medium">{box.submitted_at ? new Date(box.submitted_at).toLocaleDateString() : 'N/A'}</p>
                              </div>
                            </div>

                            <div>
                              <p className="text-sm text-gray-600">Description:</p>
                              <p className="text-sm text-gray-800">{box.description}</p>
                            </div>

                            <div>
                              <p className="text-sm text-gray-600">Amenities:</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {box.amenities?.map((amenity) => (
                                  <span
                                    key={amenity}
                                    className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                                  >
                                    {amenity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex space-x-3">
                            <button
                              onClick={() => openRejectModal(box)}
                              className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center space-x-2"
                            >
                              <X size={16} />
                              <span>Reject</span>
                            </button>
                            <button
                              onClick={() => handleApproveBox(box.id)}
                              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                            >
                              <CheckCircle size={16} />
                              <span>Approve</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">User Management</h3>
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      <Filter size={16} />
                      <span>Filter</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Role</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Bookings</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Join Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                {user.name.charAt(0)}
                              </div>
                              <span className="font-medium">{user.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">{user.email}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.role === 'Owner' 
                                ? 'bg-purple-100 text-purple-800'
                                : user.role === 'Admin'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.status === 'Active' 
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">{user.bookings}</td>
                          <td className="py-3 px-4">{new Date(user.joinDate).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <button className="p-1 text-gray-600 hover:text-primary-600">
                                <Eye size={16} />
                              </button>
                              <button className="p-1 text-gray-600 hover:text-primary-600">
                                <Edit size={16} />
                              </button>
                              <button className="p-1 text-gray-600 hover:text-red-600">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bookings Tab */}
            {activeTab === 'bookings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Booking Management</h3>
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search bookings..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <select className="px-4 py-2 border border-gray-300 rounded-lg">
                      <option>All Status</option>
                      <option>Confirmed</option>
                      <option>Completed</option>
                      <option>Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Box</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Owner</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Amount</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Commission</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => (
                        <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                {booking.user.charAt(0)}
                              </div>
                              <span>{booking.user}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">{booking.box}</td>
                          <td className="py-3 px-4">{booking.owner}</td>
                          <td className="py-3 px-4">{booking.date}</td>
                          <td className="py-3 px-4 font-medium">₹{booking.amount}</td>
                          <td className="py-3 px-4 font-medium text-green-600">₹{Math.round(booking.amount * 0.1)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              booking.status === 'Confirmed' 
                                ? 'bg-green-100 text-green-800'
                                : booking.status === 'Completed'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {booking.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <button className="p-1 text-gray-600 hover:text-primary-600">
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <div className="space-y-8">
                <h3 className="text-lg font-semibold">Platform Analytics</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Revenue Growth</h4>
                    {hasRevenueData ? <Line data={revenueData} options={chartOptions} /> : <ChartEmptyState label="No revenue data yet" />}
                  </div>
                  
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">User Acquisition</h4>
                    {hasUserGrowthData ? <Bar data={userGrowthData} options={chartOptions} /> : <ChartEmptyState label="No user growth data yet" />}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Platform Metrics</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Users</span>
                        <span className="font-medium">{users.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Active Boxes</span>
                        <span className="font-medium">{boxes.filter(b => b.status === 'Approved' || b.status === 'approved').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Bookings</span>
                        <span className="font-medium">{bookings.length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Platform Commission</span>
                        <span className="font-medium">₹{Math.round(parseFloat(totalPlatformRevenue) * 0.1).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Booking Trends</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Confirmed / Completed</span>
                        <span className="font-medium">{bookings.filter(b => b.status === 'Confirmed' || b.status === 'Completed').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Cancelled</span>
                        <span className="font-medium">{bookings.filter(b => b.status === 'Cancelled').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Average Booking Value</span>
                        <span className="font-medium">
                          ₹{bookings.length
                            ? Math.round(bookings.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0) / bookings.length).toLocaleString()
                            : 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Commission</span>
                        <span className="font-medium">₹{Math.round(bookings.reduce((sum, b) => sum + parseFloat(b.commission || 0), 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6">
                    <h4 className="font-medium mb-4">Box Status</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Approved</span>
                        <span className="font-medium">{boxes.filter(b => b.status === 'Approved' || b.status === 'approved').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Pending</span>
                        <span className="font-medium">{boxes.filter(b => b.status === 'Pending' || b.status === 'pending').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Rejected</span>
                        <span className="font-medium">{boxes.filter(b => b.status === 'Rejected' || b.status === 'rejected').length}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Owners</span>
                        <span className="font-medium">{adminData?.stats?.total_owners || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Platform Reports</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="card p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <DollarSign size={32} className="text-green-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">Revenue Report</h4>
                    <p className="text-sm text-gray-600 mb-4">Detailed financial analytics and commission tracking</p>
                    <button
                      className="btn-primary w-full"
                      onClick={() => exportToCsv('revenue-report.csv', bookings.map(b => ({
                        id: b.id, user: b.user, box: b.box, owner: b.owner, date: b.date, amount: b.amount, commission: b.commission, status: b.status,
                      })))}
                    >
                      Generate Report
                    </button>
                  </div>

                  <div className="card p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <Users size={32} className="text-blue-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">User Analytics</h4>
                    <p className="text-sm text-gray-600 mb-4">User behavior, engagement, and growth metrics</p>
                    <button
                      className="btn-primary w-full"
                      onClick={() => exportToCsv('user-analytics-report.csv', users.map(u => ({
                        id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, bookings: u.bookings, joinDate: u.joinDate,
                      })))}
                    >
                      Generate Report
                    </button>
                  </div>

                  <div className="card p-6 hover:shadow-lg transition-shadow cursor-pointer">
                    <Calendar size={32} className="text-purple-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">Booking Report</h4>
                    <p className="text-sm text-gray-600 mb-4">Booking trends, patterns, and performance analysis</p>
                    <button
                      className="btn-primary w-full"
                      onClick={() => exportToCsv('booking-report.csv', bookings.map(b => ({
                        id: b.id, date: b.date, user: b.user, box: b.box, status: b.status,
                      })))}
                    >
                      Generate Report
                    </button>
                  </div>

                  <div className="card p-6 opacity-60">
                    <TrendingUp size={32} className="text-orange-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">Performance Report</h4>
                    <p className="text-sm text-gray-600 mb-4">Platform performance and operational metrics</p>
                    <button className="btn-primary w-full" disabled title="Coming soon">Coming Soon</button>
                  </div>

                  <div className="card p-6 opacity-60">
                    <Shield size={32} className="text-red-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">Security Report</h4>
                    <p className="text-sm text-gray-600 mb-4">Security incidents, user activity, and system logs</p>
                    <button className="btn-primary w-full" disabled title="Coming soon">Coming Soon</button>
                  </div>

                  <div className="card p-6 opacity-60">
                    <Eye size={32} className="text-indigo-500 mb-4" />
                    <h4 className="font-semibold text-gray-900 mb-2">Custom Report</h4>
                    <p className="text-sm text-gray-600 mb-4">Create custom reports with specific parameters</p>
                    <button className="btn-primary w-full" disabled title="Coming soon">Coming Soon</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Rejection Modal */}
      <Modal
        isOpen={showApprovalModal}
        onClose={() => {
          setShowApprovalModal(false)
          setSelectedBox(null)
          setRejectionReason('')
        }}
        title="Reject Box Application"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to reject the application for{' '}
            <strong>{selectedBox?.name}</strong>?
          </p>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason (Optional)
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="input-field"
              rows="3"
              placeholder="Provide a reason for rejection to help the owner improve their application..."
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setShowApprovalModal(false)
                setSelectedBox(null)
                setRejectionReason('')
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleRejectBox(selectedBox?.id)}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Reject Application
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AdminDashboard