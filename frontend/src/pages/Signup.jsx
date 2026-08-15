import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, Phone, MapPin, BriefcaseBusiness } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../api.jsx'
import { PENDING_INVITE_KEY } from './InviteClaim'
import GoogleLoginButton from '../components/common/GoogleLoginButton.jsx'
import { AuthShell } from '../components/auth/AuthShell'
import { Input, Select } from '../components/ui'
import { MagneticButton } from '../components/motion/MagneticButton'

const Signup = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    location: '',
    role: 'user',
    business_name: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showconfirm_password, setShowconfirm_password] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    if (name === 'email' && errors.email && errors.email.includes('already exists')) {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.first_name) newErrors.first_name = 'First name is required'
    if (!formData.last_name) newErrors.last_name = 'Last name is required'
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      // Must match Django's AUTH_PASSWORD_VALIDATORS (MinimumLengthValidator
      // defaults to 8) — the backend rejects anything shorter regardless of
      // what this client-side check says, so the two must agree.
      newErrors.password = 'Password must be at least 8 characters'
    }
    if (!formData.confirm_password) {
      newErrors.confirm_password = 'Please confirm your password'
    } else if (formData.password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match'
    }
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required'
    } else if (!/^\+?\d{10,15}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number'
    }
    if (!formData.location) newErrors.location = 'Location is required'
    if (formData.role === 'owner' && !formData.business_name) {
      newErrors.business_name = 'Business name is required for property owners'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    setErrors({})

    try {
      const result = await signup(formData)

      if (result.success) {
        toast.success('Registration successful! Welcome to BoxNplay.')
        // A pending booking invite (see InviteClaim.jsx) takes priority
        // over the normal role-based redirect.
        const pendingInviteToken = localStorage.getItem(PENDING_INVITE_KEY)
        if (pendingInviteToken) {
          navigate(`/invites/${pendingInviteToken}`)
          return
        }
        const userRole = result.user?.role
        switch (userRole) {
          case 'admin': navigate('/admin-dashboard'); break
          case 'owner': navigate('/owner-dashboard'); break
          default: navigate('/user-dashboard')
        }
      } else if (result.error && typeof result.error === 'object') {
        const mappedErrors = {};
        for (const key in result.error) {
          if (key === 'non_field_errors' || key === 'detail') {
            mappedErrors.general = Array.isArray(result.error[key]) ? result.error[key].join(', ') : result.error[key];
          } else {
            mappedErrors[key] = Array.isArray(result.error[key]) ? result.error[key].join(', ') : result.error[key];
          }
        }
        setErrors(mappedErrors);
      } else {
        setErrors({ general: result.error || 'Registration failed. Please try again.' })
      }
    } catch (error) {
      console.error('Registration error:', error)
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Sign Up | BoxNplay</title>
        <meta name="description" content="Create a BoxNplay account to book sports boxes by the hour, or sign up as a facility owner to list your venue." />
      </Helmet>
      <AuthShell title="Create your account" subtitle="Join us to get started with your journey">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {errors.general && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-danger/10 border border-danger/30 rounded-lg p-4"
          >
            <p className="text-sm text-danger font-medium">{errors.general}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input label="First name" id="first_name" name="first_name" value={formData.first_name} onChange={handleChange} error={errors.first_name} placeholder="John" disabled={loading} />
          <Input label="Last name" id="last_name" name="last_name" value={formData.last_name} onChange={handleChange} error={errors.last_name} placeholder="Doe" disabled={loading} />
        </div>

        <Input label="Email address" id="email" name="email" type="email" value={formData.email} onChange={handleChange} leadingIcon={<Mail size={18} />} error={errors.email} placeholder="john@example.com" disabled={loading} />

        <Input label="Phone number" id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} leadingIcon={<Phone size={18} />} error={errors.phone} placeholder="+91 98765 43210" disabled={loading} />

        <div className="space-y-1.5">
          <label htmlFor="location" className="block text-sm font-medium text-foreground">Location</label>
          <div className="relative">
            <div className="absolute left-3 top-3 text-muted-foreground pointer-events-none"><MapPin size={18} /></div>
            <textarea
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              rows={2}
              className={`w-full pl-10 pr-4 py-2.5 rounded-lg bg-elevated text-foreground border transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary ${errors.location ? 'border-danger' : 'border-input'}`}
              placeholder="Mumbai, Maharashtra, India"
              disabled={loading}
            />
          </div>
          {errors.location && <p className="text-sm text-danger">{errors.location}</p>}
        </div>

        <Select label="I am a" id="role" name="role" value={formData.role} onChange={handleChange} disabled={loading}>
          <option value="user">User</option>
          <option value="owner">Property owner</option>
        </Select>

        {formData.role === 'owner' && (
          <Input label="Business name" id="business_name" name="business_name" value={formData.business_name} onChange={handleChange} leadingIcon={<BriefcaseBusiness size={18} />} error={errors.business_name} placeholder="Elite Sports Complex" disabled={loading} />
        )}

        <Input
          label="Password"
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formData.password}
          onChange={handleChange}
          leadingIcon={<Lock size={18} />}
          trailingIcon={
            <button type="button" onClick={() => setShowPassword(!showPassword)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          error={errors.password}
          hint={!errors.password ? 'At least 8 characters, not a commonly used password' : undefined}
          placeholder="Create a password"
          disabled={loading}
        />

        <Input
          label="Confirm password"
          id="confirm_password"
          name="confirm_password"
          type={showconfirm_password ? 'text' : 'password'}
          value={formData.confirm_password}
          onChange={handleChange}
          leadingIcon={<Lock size={18} />}
          trailingIcon={
            <button type="button" onClick={() => setShowconfirm_password(!showconfirm_password)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              {showconfirm_password ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          error={errors.confirm_password}
          placeholder="Confirm your password"
          disabled={loading}
        />

        <MagneticButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </MagneticButton>

        <p className="text-center text-xs text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary/80 underline underline-offset-2">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-primary/80 underline underline-offset-2">
            Privacy Policy
          </Link>.
        </p>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or continue with <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleLoginButton setLoading={setLoading} setErrors={setErrors} />

        <p className="text-center text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary/80">
            Sign in here
          </Link>
        </p>
      </form>
      </AuthShell>
    </>
  )
}

export default Signup;
