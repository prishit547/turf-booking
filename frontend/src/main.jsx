import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './api.jsx'
import { BoxProvider } from './context/BoxContext.jsx'
import { BookingProvider } from './context/BookingContext.jsx'
import { NotificationProvider } from './context/NotificationContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const isGoogleConfigured = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== "your_google_client_id_here";

const appProviders = (
  <HelmetProvider>
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <BoxProvider>
            <BookingProvider>
              <App />
            </BookingProvider>
          </BoxProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </HelmetProvider>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {isGoogleConfigured ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          {appProviders}
        </GoogleOAuthProvider>
      ) : (
        appProviders
      )}
    </ErrorBoundary>
  </StrictMode>,
)