import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, LayoutDashboard, User, LogOut, Map, ChevronDown } from 'lucide-react'
import { useAuth } from '../../api.jsx'
import NearbyBoxesMap from '../maps/NearbyBoxesMap'
import NotificationBell from './NotificationBell'

const nav = [
  { to: '/boxes', label: 'Browse Boxes' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

/** Shared logo mark — also used standalone on the Auth pages, matching the reference's `Logo` export from SiteHeader. */
export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-sm font-black text-primary-foreground">
        B
      </span>
      <span className="font-display text-lg font-black uppercase tracking-tight">
        Box<span className="text-primary">Nplay</span>
      </span>
    </Link>
  )
}

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const displayName = user?.full_name || user?.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.email

  useEffect(() => {
    if (!isMenuOpen) return
    setIsMenuOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const handleLogout = () => {
    logout()
    navigate('/')
    setIsUserMenuOpen(false)
  }

  const getDashboardRoute = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin':
        return '/admin-dashboard'
      case 'owner':
        return '/owner-dashboard'
      default:
        return '/user-dashboard'
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="relative rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <Map className="h-4 w-4" /> Nearby
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <div className="hidden md:block">
                <NotificationBell />
              </div>
            )}
            {isAuthenticated ? (
              <div className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm transition hover:border-primary/60"
                >
                  <LayoutDashboard className="h-4 w-4" /> {displayName?.split(' ')[0] || 'Account'}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <AnimatePresence>
                  {isUserMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card py-2 shadow-lift"
                    >
                      <div className="px-4 py-2.5">
                        <p className="truncate text-sm font-semibold text-foreground">{displayName || 'Account'}</p>
                        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                        {user?.role && user.role !== 'user' && (
                          <span className="mt-1.5 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            {user.role}
                          </span>
                        )}
                      </div>
                      <hr className="my-2 border-border" />
                      <Link
                        to={getDashboardRoute()}
                        className="flex items-center gap-3 px-4 py-2.5 text-foreground transition hover:bg-elevated"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <LayoutDashboard size={16} className="text-primary" /> Dashboard
                      </Link>
                      <Link
                        to="/profile"
                        className="flex items-center gap-3 px-4 py-2.5 text-foreground transition hover:bg-elevated"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <User size={16} className="text-turf" /> Profile
                      </Link>
                      <hr className="my-2 border-border" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-foreground transition hover:bg-danger/10"
                      >
                        <LogOut size={16} className="text-danger" /> Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden rounded-full border border-border px-4 py-2 text-sm transition hover:border-primary/60 md:block"
              >
                Log in
              </Link>
            )}
            <Link
              to="/boxes"
              className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition hover:bg-primary/90"
            >
              Book now
            </Link>
            <button
              type="button"
              // -m-3 offsets the p-3 so the visible icon doesn't shift or
              // grow, but the actual tap target grows from a 20x20px icon
              // (below the 24x24 WCAG minimum) to a full 44x44px — this is
              // the primary nav control on mobile, so it matters most here.
              className="md:hidden -m-3 p-3"
              aria-label="Toggle menu"
              onClick={() => setIsMenuOpen((v) => !v)}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden border-t border-border transition-all md:hidden ${
            isMenuOpen ? 'max-h-96' : 'max-h-0'
          }`}
        >
          <nav className="flex flex-col gap-1 p-4">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowMap(true)
                setIsMenuOpen(false)
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Map size={16} /> Nearby boxes
            </button>
            {isAuthenticated ? (
              <>
                <div className="px-3 py-2">
                  <NotificationBell />
                </div>
                <Link
                  to={getDashboardRoute()}
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  Dashboard
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-card"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
              >
                Log in / Sign up
              </Link>
            )}
          </nav>
        </div>
      </header>

      <NearbyBoxesMap isOpen={showMap} onClose={() => setShowMap(false)} />
    </>
  )
}

export default Header
