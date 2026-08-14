import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../api.jsx';
import { PENDING_INVITE_KEY } from './InviteClaim';
import GoogleLoginButton from '../components/common/GoogleLoginButton.jsx';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { login, logout, generalError: authContextGeneralError } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});
    logout();

    try {
      const result = await login({ email: formData.email, password: formData.password }, rememberMe);

      if (result.success) {
        // A pending booking invite (see InviteClaim.jsx) takes priority
        // over the normal role-based redirect — the user came from that
        // link and expects to land back on it, not their dashboard.
        const pendingInviteToken = localStorage.getItem(PENDING_INVITE_KEY);
        if (pendingInviteToken) {
          navigate(`/invites/${pendingInviteToken}`);
          return;
        }
        const userRole = result.user?.role;
        switch (userRole) {
          case 'admin': navigate('/admin-dashboard'); break;
          case 'owner': navigate('/owner-dashboard'); break;
          default: navigate('/user-dashboard');
        }
      } else if (result.errors) {
        setErrors(result.errors);
      } else if (result.error) {
        setErrors({ general: result.error });
      } else {
        setErrors({ general: 'An unknown error occurred during login.' });
      }
    } catch (error) {
      console.error('Login request failed:', error);
      setErrors({ general: 'Network error or unhandled exception. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your BookMyBox account and continue your sports journey">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {(errors.general || authContextGeneralError) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-danger/10 border border-danger/30 rounded-lg p-4"
          >
            <p className="text-sm text-danger font-medium">{errors.general || authContextGeneralError}</p>
          </motion.div>
        )}

        <Input
          label="Email address"
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          leadingIcon={<Mail size={18} />}
          error={errors.email}
          placeholder="Enter your email"
          disabled={loading}
        />

        <Input
          label="Password"
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formData.password}
          onChange={handleChange}
          leadingIcon={<Lock size={18} />}
          trailingIcon={
            <button type="button" onClick={() => setShowPassword(!showPassword)} disabled={loading} className="pointer-events-auto text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          error={errors.password}
          placeholder="Enter your password"
          disabled={loading}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-input bg-elevated text-primary focus:ring-primary/40"
              disabled={loading}
            />
            <label htmlFor="remember-me" className="text-sm text-muted-foreground">Remember me</label>
          </div>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:text-primary/80">
            Forgot password?
          </Link>
        </div>

        <MagneticButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </MagneticButton>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or continue with <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleLoginButton setLoading={setLoading} setErrors={setErrors} />

        <p className="text-center text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-primary hover:text-primary/80">
            Sign up here
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export default Login;
