import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import ScrollToTop from './components/common/ScrollToTop';
import { Loader } from './components/ui';
import { useAuth } from './api.jsx'; // Correct path and extension

// Route-level code splitting: each page becomes its own chunk, fetched on
// first navigation instead of all being bundled into one ~1.2MB entry file.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const InviteClaim = lazy(() => import('./pages/InviteClaim'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const BoxListings = lazy(() => import('./pages/BoxListings'));
const BoxDetails = lazy(() => import('./pages/BoxDetails'));
const Checkout = lazy(() => import('./pages/Checkout'));
const BookingConfirmation = lazy(() => import('./pages/BookingConfirmation'));
const UserDashboard = lazy(() => import('./pages/UserDashboard'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Terms = lazy(() => import('./pages/Terms'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const CancellationPolicy = lazy(() => import('./pages/CancellationPolicy'));
const NotFound = lazy(() => import('./pages/NotFound'));

const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader text="Loading..." />
  </div>
);

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && (!user || !allowedRoles.includes(user.role))) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const { user } = useAuth();
  const location = useLocation();
  const canonicalUrl = `https://boxnplay.com${location.pathname}`;

  return (
      <div className="min-h-screen bg-background">
        {/* Site-wide fallback — any route without its own <Helmet> (About,
            dashboards, etc.) still gets a real description/OG tags instead
            of none at all. Pages that render their own <Helmet> (Home,
            BoxListings, BoxDetails) override these per-key automatically. */}
        <Helmet>
          <meta name="description" content="Book sports boxes and cricket turfs by the hour on BoxNplay. Live availability, instant confirmation, no phone calls." />
          <meta name="keywords" content="turf booking, sports box booking, cricket turf, football ground, badminton court, box cricket, sports venue ahmedabad, boxnplay" />
          <meta property="og:site_name" content="BoxNplay" />
          <meta property="og:type" content="website" />
          <meta property="og:locale" content="en_IN" />
          <link rel="canonical" href={canonicalUrl} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="BoxNplay - Book Sports Boxes & Turfs by the Hour" />
          <meta name="twitter:description" content="Book sports boxes and cricket turfs by the hour on BoxNplay. Live availability, instant confirmation, no phone calls." />
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://boxnplay.com/#organization',
                  name: 'BoxNplay',
                  url: 'https://boxnplay.com',
                  logo: 'https://boxnplay.com/favicon.svg',
                  description: 'Book sports boxes, cricket turfs, football grounds, and badminton courts by the hour on BoxNplay.',
                  email: 'Info@boxnplay.com',
                  telephone: '+91-98253-27612',
                  contactPoint: {
                    '@type': 'ContactPoint',
                    telephone: '+91-98253-27612',
                    email: 'Info@boxnplay.com',
                    contactType: 'customer support',
                    areaServed: 'IN',
                    availableLanguage: ['English', 'Hindi', 'Gujarati'],
                  },
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://boxnplay.com/#website',
                  name: 'BoxNplay',
                  url: 'https://boxnplay.com',
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: 'https://boxnplay.com/boxes?search={search_term_string}',
                    },
                    'query-input': 'required name=search_term_string',
                  },
                },
              ],
            })}
          </script>
        </Helmet>
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable theme="dark" />
        <ScrollToTop />
        <Header />
        {/*
          Enter-only fade, no AnimatePresence: an exit-blocking `mode="wait"`
          transition sounds nicer but leaves the OLD page on screen (looking
          like a frozen/black page) whenever its exit animation doesn't
          resolve promptly — e.g. protected routes that immediately redirect
          again (see /dashboard below) re-key this before the first exit even
          finishes, so a wait-for-exit transition can stall indefinitely.
          Keying a plain motion.div by pathname animates the incoming page in
          while letting React unmount the outgoing one immediately, which is
          both smoother in practice and impossible to get stuck on.
        */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/invites/:token" element={<InviteClaim />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Core Box / Turf Listings & Details + SEO Aliases */}
            <Route path="/boxes" element={<BoxListings />} />
            <Route path="/turfs" element={<BoxListings />} />
            <Route path="/explore" element={<BoxListings />} />
            <Route path="/venues" element={<BoxListings />} />
            <Route path="/boxes/:id" element={<BoxDetails />} />
            <Route path="/turf/:id" element={<BoxDetails />} />
            <Route path="/box/:id" element={<BoxDetails />} />

            {/* Informational Pages + Friendly Aliases */}
            <Route path="/about" element={<About />} />
            <Route path="/about-us" element={<Navigate to="/about" replace />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/contact-us" element={<Navigate to="/contact" replace />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
            <Route path="/terms-and-conditions" element={<Navigate to="/terms" replace />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
            <Route path="/cancellation-policy" element={<CancellationPolicy />} />
            <Route path="/cancellation" element={<Navigate to="/cancellation-policy" replace />} />

            {/* Venue Partner / Onboarding Quick Links */}
            <Route path="/list-your-venue" element={<Navigate to="/signup?role=owner" replace />} />
            <Route path="/list-venue" element={<Navigate to="/signup?role=owner" replace />} />
            <Route path="/partner" element={<Navigate to="/signup?role=owner" replace />} />
            <Route path="/owner" element={<Navigate to="/dashboard" replace />} />

            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />

            <Route path="/checkout" element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            } />

            <Route path="/booking/:bookingId" element={
              <ProtectedRoute>
                <BookingConfirmation />
              </ProtectedRoute>
            } />
            <Route path="/booking-confirmation/:bookingId" element={
              <ProtectedRoute>
                <BookingConfirmation />
              </ProtectedRoute>
            } />

            <Route path="/user-dashboard" element={
              <ProtectedRoute allowedRoles={['user']}>
                <UserDashboard />
              </ProtectedRoute>
            } />

            <Route path="/owner-dashboard" element={
              <ProtectedRoute allowedRoles={['owner']}>
                <OwnerDashboard />
              </ProtectedRoute>
            } />

            <Route path="/admin-dashboard" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                {user?.role === 'admin' ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : user?.role === 'owner' ? (
                  <Navigate to="/owner-dashboard" replace />
                ) : (
                  <Navigate to="/user-dashboard" replace />
                )}
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Navigate to="/admin-dashboard" replace />
              </ProtectedRoute>
            } />

            {/* Catch-all route for 404 errors */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </motion.div>
        <Footer />
      </div>
  );
}
export default App;