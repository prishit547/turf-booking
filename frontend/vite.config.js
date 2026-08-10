import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Splits large, infrequently-changing vendor libraries into their
        // own cacheable chunks instead of one ~1.2MB bundle — route-level
        // code splitting (see App.jsx's React.lazy() usage) handles the
        // rest by page.
        manualChunks: {
          maps: ['@vis.gl/react-google-maps'],
          charts: ['chart.js', 'react-chartjs-2'],
          'framer-motion': ['framer-motion'],
        },
      },
    },
  },
  server: {
    // Let Vite choose an available port automatically
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Your Django server's address
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000', // Channels WebSocket endpoint (slot reservation status)
        ws: true,
      },
    },
  },
})