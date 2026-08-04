/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      colors: {
        // Dark-only "athletic SaaS" palette — near-black surfaces with a
        // single electric lime accent (the one confident color, used
        // aggressively for every CTA/active/selected state) and a turf-green
        // secondary reserved for sport-specific tinting. No light-mode pair;
        // there is exactly one theme now.
        background: '#090A0C',
        foreground: '#F5F7F9',
        card: '#131519',
        popover: '#131519',
        elevated: '#1D2126',
        muted: '#1D2126',
        'muted-foreground': '#A4AAB2',
        secondary: '#21242A',
        'secondary-foreground': '#F5F7F9',
        accent: '#232933',
        'accent-foreground': '#F5F7F9',
        border: 'rgba(255,255,255,0.12)',
        input: 'rgba(255,255,255,0.16)',
        ring: 'rgba(209,251,0,0.6)',
        // Electric lime — the single dominant accent. CTAs, active states,
        // selected slots, links, glow shadows. Never diluted.
        primary: {
          DEFAULT: '#D1FB00',
          foreground: '#0E1103',
        },
        // Turf/kelly green — secondary accent, reserved for sport-badge
        // tinting and chart series, echoing the actual grass of a pitch.
        turf: {
          DEFAULT: '#239848',
          foreground: '#F5F7F9',
        },
        success: '#3FC168',
        warning: '#F2AB19',
        danger: '#F03B3F',
        destructive: '#F03B3F',
      },
      fontFamily: {
        display: ['"Archivo"', 'sans-serif'],
        sans: ['"Inter Tight"', 'sans-serif'],
      },
      borderRadius: {
        sm: '10px',
        DEFAULT: '12px',
        md: '12px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '26px',
        full: '9999px',
      },
      boxShadow: {
        glow: '0 18px 50px -18px rgba(209,251,0,0.55)',
        lift: '0 24px 60px -24px rgba(0,0,0,0.85)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
