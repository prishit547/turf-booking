import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '../api.jsx';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ new_password: '', confirm_new_password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.new_password.length < 6) {
      setErrors({ new_password: 'Password must be at least 6 characters' });
      return;
    }
    if (formData.new_password !== formData.confirm_new_password) {
      setErrors({ confirm_new_password: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      await api.post('/user/password-reset/confirm/', { token, ...formData });
      toast.success('Password reset — please sign in with your new password.');
      navigate('/login');
    } catch (error) {
      const data = error.response?.data;
      if (data?.errors) {
        // DRF field errors come back as {field: [messages]} — flatten to strings.
        const flattened = Object.fromEntries(
          Object.entries(data.errors).map(([field, msgs]) => [field, Array.isArray(msgs) ? msgs.join(' ') : String(msgs)])
        );
        setErrors(flattened);
      } else {
        setErrors({ general: 'This reset link is invalid or has expired. Please request a new one.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password for your account">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {(errors.general || errors.token || errors.non_field_errors) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-danger/10 border border-danger/30 rounded-lg p-4"
          >
            <p className="text-sm text-danger font-medium">
              {errors.general || errors.token || errors.non_field_errors}
            </p>
          </motion.div>
        )}

        <Input
          label="New password"
          id="new_password"
          name="new_password"
          type={showPassword ? 'text' : 'password'}
          value={formData.new_password}
          onChange={handleChange}
          leadingIcon={<Lock size={18} />}
          trailingIcon={
            <button type="button" onClick={() => setShowPassword(!showPassword)} disabled={loading} className="pointer-events-auto text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          error={errors.new_password}
          placeholder="At least 6 characters"
          disabled={loading}
        />

        <Input
          label="Confirm new password"
          id="confirm_new_password"
          name="confirm_new_password"
          type={showPassword ? 'text' : 'password'}
          value={formData.confirm_new_password}
          onChange={handleChange}
          leadingIcon={<Lock size={18} />}
          error={errors.confirm_new_password}
          placeholder="Re-enter your new password"
          disabled={loading}
        />

        <MagneticButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Resetting…' : 'Reset password'}
        </MagneticButton>

        <p className="text-center text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
