// OwnerDashboard.jsx

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler,
} from 'chart.js';
import {
  Plus, Edit, Eye, TrendingUp, Calendar, DollarSign, Star, Clock, BarChart3,
  AlertCircle, CheckCircle, Activity, Sparkles, Building,
} from 'lucide-react';

import AddBoxForm from '../components/boxes/AddBoxForm';
import ViewBoxModal from '../components/boxes/ViewBoxModal';
import { useAuth, api, MEDIA_BASE_URL } from '../api.jsx';
import { useBox } from '../context/BoxContext';
import { Button, Card, Badge, Loader, StatTile } from '../components/ui';
import { useChartTheme } from '../utils/chartTheme';

// ChartJS Registration
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler);

const FALLBACK_BOX_IMAGE = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200&q=80';

// Reusable dashboard conventions, copied verbatim from UserDashboard.jsx (see
// that file's comments) rather than reinvented.
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'boxes', label: 'My Boxes', icon: Building },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
];

const BOX_STATUS_TONE = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
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
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddBoxModal, setShowAddBoxModal] = useState(false);
  const [showEditBoxModal, setShowEditBoxModal] = useState(false);
  const [showViewBoxModal, setShowViewBoxModal] = useState(false);
  const [selectedBox, setSelectedBox] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const { refreshAll } = useBox();
  const chartTheme = useChartTheme();

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

  // Data derivation from API
  const {
    total_revenue = 0,
    total_bookings = 0,
    active_boxes_count = 0,
    pending_boxes_count = 0,
    avg_rating = '0.0',
    revenue_chart_labels = [],
    revenue_chart_data = [],
    bookings_chart_labels = [],
    bookings_chart_data = [],
    sports_distribution = {},
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

  // Chart data & options — colors come from the live theme (Chart.js renders
  // to canvas, so it can't inherit Tailwind CSS classes).
  const revenueData = {
    labels: revenue_chart_labels,
    datasets: [{
      label: 'Revenue (₹)',
      data: revenue_chart_data,
      borderColor: chartTheme.colors.primary,
      backgroundColor: chartTheme.hexToRgba(chartTheme.colors.primary, 0.1),
      pointBackgroundColor: chartTheme.colors.primary,
      tension: 0.4,
      fill: true
    }],
  };

  const bookingsData = {
    labels: bookings_chart_labels,
    datasets: [{
      label: 'Bookings',
      data: bookings_chart_data,
      backgroundColor: chartTheme.hexToRgba(chartTheme.colors.success, 0.8),
      borderRadius: 4
    }],
  };

  const sportsData = {
    labels: Object.keys(sports_distribution),
    datasets: [{
      data: Object.values(sports_distribution),
      backgroundColor: Object.keys(sports_distribution).map(
        (_, i) => chartTheme.series[i % chartTheme.series.length]
      ),
      borderWidth: 0
    }],
  };

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
  };

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: chartTheme.text } },
      tooltip: chartTheme.tooltip,
    },
  };

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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {stats.map((stat) => (
                  <StatTile key={stat.key} tone={stat.tone} icon={stat.icon} value={stat.value} label={stat.label} />
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={20} className="text-primary" />
                    <h3 className="text-lg font-display font-semibold text-foreground">Revenue Trend</h3>
                  </div>
                  {revenue_chart_data.length > 0 ? (
                    <Line data={revenueData} options={chartOptions} />
                  ) : (
                    <Placeholder text="No revenue data available" icon={TrendingUp} />
                  )}
                </Card>

                <Card padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={20} className="text-primary" />
                    <h3 className="text-lg font-display font-semibold text-foreground">Weekly Bookings</h3>
                  </div>
                  {bookings_chart_data.length > 0 ? (
                    <Bar data={bookingsData} options={chartOptions} />
                  ) : (
                    <Placeholder text="No booking data available" icon={Calendar} />
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
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

                <Card padding="md">
                  <h3 className="text-base sm:text-lg font-display font-semibold mb-4 text-foreground">
                    Sports Distribution
                  </h3>
                  {sportsData.labels.length > 0 ? (
                    <Doughnut data={sportsData} options={doughnutOptions} />
                  ) : (
                    <Placeholder text="No sports data available" icon={Activity} />
                  )}
                </Card>
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
                            {box.status}
                          </Badge>
                        </div>
                      </div>

                      <h3 className="text-xl font-display font-semibold text-foreground">{box.name}</h3>
                      <p className="text-muted-foreground text-sm mt-1">{box.location}</p>
                      <p className="text-primary font-medium text-lg mt-2 tabular-nums">
                        ₹{box.price}/hour
                      </p>

                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" icon={<Eye size={16} />} fullWidth onClick={() => handleViewBox(box)}>
                          View
                        </Button>
                        <Button variant="outline" size="sm" icon={<Edit size={16} />} fullWidth onClick={() => handleEditBox(box)}>
                          Edit
                        </Button>
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

          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                Recent Bookings ({recent_bookings.length})
              </h2>

              {recent_bookings.length > 0 ? (
                <Card padding="md">
                  <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    {recent_bookings.map((booking) => (
                      <div key={booking.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="font-semibold text-lg text-foreground">
                            {booking.user_name || 'Customer'}
                          </p>
                          <p className="text-muted-foreground">{booking.box_name}</p>
                          <p className="text-muted-foreground text-sm">
                            {new Date(booking.date).toLocaleDateString()} &bull; {booking.time_slot}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-primary font-medium text-lg tabular-nums">
                            ₹{booking.amount}
                          </p>
                          <Badge tone="success">Confirmed</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <Card padding="lg" className="text-center">
                  <Placeholder text="No bookings found" icon={Calendar} />
                </Card>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display font-semibold text-foreground">Business Analytics</h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                <Card padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={20} className="text-primary" />
                    <h3 className="text-lg font-display font-semibold text-foreground">Revenue Analytics</h3>
                  </div>
                  {revenue_chart_data.length > 0 ? (
                    <Line data={revenueData} options={chartOptions} />
                  ) : (
                    <Placeholder text="No revenue analytics available" icon={TrendingUp} />
                  )}
                </Card>

                <Card padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={20} className="text-primary" />
                    <h3 className="text-lg font-display font-semibold text-foreground">Booking Trends</h3>
                  </div>
                  {bookings_chart_data.length > 0 ? (
                    <Bar data={bookingsData} options={chartOptions} />
                  ) : (
                    <Placeholder text="No booking trends available" icon={BarChart3} />
                  )}
                </Card>
              </div>
            </div>
          )}
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
        />
      )}
    </div>
  );
};

export default OwnerDashboard;
