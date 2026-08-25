import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  RadialLinearScale,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import { useChartTheme } from '../../utils/chartTheme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
  RadialLinearScale
);

// Enhanced Revenue Trend Chart
export const EnhancedRevenueTrend = ({ data, loading = false }) => {
  const theme = useChartTheme();

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse flex space-x-4">
          <div className="rounded-full bg-elevated h-10 w-10"></div>
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-elevated rounded w-3/4"></div>
            <div className="h-4 bg-elevated rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        label: 'Revenue (₹)',
        data: data?.values || [],
        borderColor: theme.colors.primary,
        backgroundColor: theme.hexToRgba(theme.colors.primary, 0.1),
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: theme.colors.primary,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        ...theme.tooltip,
        callbacks: {
          title: (context) => `${context[0].label}`,
          label: (context) => `Revenue: ₹${context.parsed.y.toLocaleString()}`,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          color: theme.grid,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
          callback: (value) => `₹${value.toLocaleString()}`,
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-64"
    >
      <Line data={chartData} options={options} />
    </motion.div>
  );
};

// Enhanced Sport Distribution Chart
export const EnhancedSportDistribution = ({ data, loading = false }) => {
  const theme = useChartTheme();

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
      </div>
    );
  }

  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        data: data?.values || [],
        backgroundColor: (data?.labels || []).map((_, i) => theme.series[i % theme.series.length]),
        borderColor: '#fff',
        borderWidth: 3,
        hoverBorderWidth: 4,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
          color: theme.text,
          generateLabels: function(chart) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => {
                const value = data.datasets[0].data[i];
                const percentage = ((value / data.datasets[0].data.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  lineWidth: 0,
                  pointStyle: 'circle',
                  index: i
                };
              });
            }
            return [];
          }
        },
      },
      tooltip: {
        ...theme.tooltip,
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="h-64"
    >
      <Doughnut data={chartData} options={options} />
    </motion.div>
  );
};

// Booking Activity Heatmap (Bar Chart)
export const BookingActivityChart = ({ data, loading = false }) => {
  const theme = useChartTheme();

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse space-y-2 w-full">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-6 bg-elevated rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        label: 'Hours Played',
        data: data?.values || [],
        backgroundColor: (ctx) => {
          const value = ctx.parsed?.y || 0;
          const max = Math.max(...(data?.values || [1]));
          const opacity = Math.max(0.3, value / max);
          return theme.hexToRgba(theme.colors.success, opacity);
        },
        borderColor: theme.colors.success,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        ...theme.tooltip,
        callbacks: {
          label: (context) => `${context.parsed.y} hours played`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          color: theme.grid,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
          callback: (value) => `${value}h`,
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-64"
    >
      <Bar data={chartData} options={options} />
    </motion.div>
  );
};

// Peak Booking Hours — bar chart. Was previously a PolarArea chart, which
// got cluttered and hard to read once a box had bookings spread across
// ~18 different hours (only 6 legend colors to go around, legend overflow).
// A single-series bar chart along a chronological x-axis reads far more
// clearly for "what % of bookings land in each hour" than wedges ever did.
export const PeakHoursChart = ({ data, loading = false }) => {
  const theme = useChartTheme();

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-turf"></div>
      </div>
    );
  }

  const values = data?.values || [];
  const max = Math.max(...(values.length ? values : [1]));

  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        label: 'Booking Percentage',
        data: values,
        backgroundColor: (ctx) => {
          const value = ctx.parsed?.y ?? 0;
          const opacity = max > 0 ? Math.max(0.35, value / max) : 0.7;
          return theme.hexToRgba(theme.colors.primary, opacity);
        },
        borderColor: theme.colors.primary,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        ...theme.tooltip,
        callbacks: {
          label: (context) => `${context.label}: ${context.parsed.y.toFixed(1)}% of bookings`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 11,
          },
        },
      },
      y: {
        grid: {
          color: theme.grid,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
          callback: (value) => `${value}%`,
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-64"
    >
      <Bar data={chartData} options={options} />
    </motion.div>
  );
};

// Monthly activity trend with gradient. Reports hours played, not money
// spent — the customer dashboard never tallies a player's spending.
export const MonthlyActivityChart = ({ data, loading = false }) => {
  const theme = useChartTheme();

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse space-y-1 w-full">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-8 bg-elevated rounded"
              style={{ width: `${Math.random() * 60 + 40}%` }}
            ></div>
          ))}
        </div>
      </div>
    );
  }

  const chartData = {
    labels: data?.labels || [],
    datasets: [
      {
        label: 'Hours played',
        data: data?.values || [],
        borderColor: theme.colors.secondary,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;

          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, theme.hexToRgba(theme.colors.secondary, 0));
          gradient.addColorStop(1, theme.hexToRgba(theme.colors.secondary, 0.3));
          return gradient;
        },
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: theme.colors.secondary,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        ...theme.tooltip,
        callbacks: {
          label: (context) => `${context.parsed.y.toLocaleString()} hrs played`,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          color: theme.grid,
        },
        ticks: {
          color: theme.text,
          font: {
            size: 12,
          },
          callback: (value) => `${value.toLocaleString()} hrs`,
        },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-64"
    >
      <Line data={chartData} options={options} />
    </motion.div>
  );
};
