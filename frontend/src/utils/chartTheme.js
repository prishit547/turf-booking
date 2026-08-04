// Chart.js renders to <canvas>, so it can't pick up Tailwind classes the
// way the rest of the app does — colors have to be resolved to literal
// strings here. Keep these in sync with tailwind.config.js by hand.
const PALETTE = {
  primary: '#D1FB00',   // primary, electric lime
  primaryLight: '#E4FF66',
  secondary: '#239848', // turf, kelly green
  success: '#3FC168',
  warning: '#F2AB19',
  danger: '#F03B3F',
  stone: '#A4AAB2',      // muted-foreground
};

// Ordered palette for multi-series charts (sport distribution, peak hours,
// etc.) — cycles through the brand accent before falling back to neutrals.
const SERIES = [PALETTE.primary, PALETTE.secondary, PALETTE.warning, PALETTE.success, PALETTE.danger, PALETTE.stone];

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Static chart theme — the app is dark-only now, so there's nothing to
// re-resolve on toggle.
const CHART_THEME = {
  colors: PALETTE,
  series: SERIES,
  text: '#A4AAB2',
  grid: 'rgba(255, 255, 255, 0.08)',
  tooltip: {
    backgroundColor: 'rgba(9, 10, 12, 0.95)',
    titleColor: '#F5F7F9',
    bodyColor: '#F5F7F9',
    borderWidth: 0,
    cornerRadius: 8,
    displayColors: false,
    padding: 10,
  },
  hexToRgba,
};

export function useChartTheme() {
  return CHART_THEME;
}
