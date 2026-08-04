import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, User, LogOut, Map, ChevronDown } from 'lucide-react'
import { useAuth } from '../../api.jsx'
import NearbyBoxesMap from '../maps/NearbyBoxesMap'
import { Button, Badge } from '../ui'

const ROLE_TONE = { admin: 'secondary', owner: 'success', user: 'primary' }

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Browse Boxes', path: '/boxes' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ]

  const userMenuVariants = {
    initial: { opacity: 0, scale: 0.97, y: -8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: -8 },
  }

  return (
    <>
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-200 bg-background/85 backdrop-blur ${
          scrolled ? 'shadow-lift border-b border-border' : 'border-b border-transparent'
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="bg-primary text-primary-foreground w-10 h-10 rounded-lg flex items-center justify-center font-display font-semibold text-base group-hover:bg-primary/90 transition-colors">
                BMB
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-display font-semibold text-lg text-foreground">
                  Book<span className="text-primary">MyBox</span>
                </span>
                <span className="text-xs text-muted-foreground -mt-0.5">Sports made easy</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  className="group relative px-4 py-2 rounded-lg font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                  {item.name}
                  <span className="absolute bottom-1 left-4 right-4 h-0.5 bg-primary rounded-full scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-200" />
                </Link>
              ))}

              <button
                onClick={() => setShowMap(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Map size={17} />
                <span>Nearby Boxes</span>
              </button>
            </nav>

            {/* Desktop Auth */}
            <div className="hidden lg:flex items-center gap-3">
              {isAuthenticated ? (
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-3 bg-secondary hover:bg-elevated px-3 py-2 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
                      <User size={16} className="text-primary-foreground" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-foreground text-sm">{user?.name}</span>
                      <Badge tone={ROLE_TONE[user?.role] || 'neutral'} size="sm">{user?.role}</Badge>
                    </div>
                    <motion.div animate={{ rotate: isUserMenuOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={16} className="text-muted-foreground" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {isUserMenuOpen && (
                      <motion.div
                        variants={userMenuVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 bg-card rounded-2xl shadow-lift border border-border py-2 overflow-hidden"
                      >
                        <Link
                          to={getDashboardRoute()}
                          className="flex items-center gap-3 px-4 py-2.5 text-foreground hover:bg-elevated transition-colors"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <div className="w-8 h-8 bg-primary/15 rounded-md flex items-center justify-center">
                            <User size={16} className="text-primary" />
                          </div>
                          <span className="font-medium">Dashboard</span>
                        </Link>
                        <Link
                          to="/profile"
                          className="flex items-center gap-3 px-4 py-2.5 text-foreground hover:bg-elevated transition-colors"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <div className="w-8 h-8 bg-turf/15 rounded-md flex items-center justify-center">
                            <User size={16} className="text-turf" />
                          </div>
                          <span className="font-medium">Profile</span>
                        </Link>
                        <hr className="my-2 border-border" />
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-foreground hover:bg-danger/10 transition-colors"
                        >
                          <div className="w-8 h-8 bg-danger/15 rounded-md flex items-center justify-center">
                            <LogOut size={16} className="text-danger" />
                          </div>
                          <span className="font-medium">Logout</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    to="/login"
                    className="text-muted-foreground hover:text-primary font-medium px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    Login
                  </Link>
                  <Button as={Link} to="/signup" size="sm">Sign Up</Button>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center gap-1">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2.5 rounded-lg hover:bg-elevated text-muted-foreground transition-colors"
              >
                {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="lg:hidden border-t border-border py-4"
              >
                <nav className="flex flex-col gap-1">
                  {navItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.path}
                      className="flex items-center gap-3 text-muted-foreground hover:text-primary font-medium py-3 px-4 rounded-lg hover:bg-primary/10 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  ))}

                  <button
                    onClick={() => {
                      setShowMap(true)
                      setIsMenuOpen(false)
                    }}
                    className="flex items-center gap-3 text-muted-foreground hover:text-primary font-medium py-3 px-4 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    <Map size={20} />
                    <span>Nearby Boxes</span>
                  </button>

                  {isAuthenticated ? (
                    <div className="flex flex-col gap-1 pt-4 mt-2 border-t border-border">
                      <div className="px-4 py-1 text-sm text-muted-foreground font-medium">Welcome, {user?.name}</div>
                      <Link
                        to={getDashboardRoute()}
                        className="flex items-center gap-3 text-muted-foreground hover:text-primary font-medium py-3 px-4 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <User size={20} />
                        <span>Dashboard</span>
                      </Link>
                      <Link
                        to="/profile"
                        className="flex items-center gap-3 text-muted-foreground hover:text-primary font-medium py-3 px-4 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <User size={20} />
                        <span>Profile</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 text-muted-foreground hover:text-danger font-medium py-3 px-4 rounded-lg hover:bg-danger/10 transition-colors"
                      >
                        <LogOut size={20} />
                        <span>Logout</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-border">
                      <Link
                        to="/login"
                        className="text-muted-foreground hover:text-primary font-medium py-3 px-4 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Login
                      </Link>
                      <Button as={Link} to="/signup" onClick={() => setIsMenuOpen(false)}>Sign Up</Button>
                    </div>
                  )}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <NearbyBoxesMap isOpen={showMap} onClose={() => setShowMap(false)} />
    </>
  )
}

export default Header
