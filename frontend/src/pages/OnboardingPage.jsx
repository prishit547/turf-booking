import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, MapPin, BriefcaseBusiness } from 'lucide-react';
import { api, useAuth } from '../api';
import { AuthShell } from '../components/auth/AuthShell';
import { Input, Select } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';

const OnboardingPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hydrateAuth } = useAuth();
  const { user, isNewUser } = location.state || {};

  const [formData, setFormData] = useState({
    phone: '',
    location: '',
    role: user?.role || 'user',
    business_name: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\+?\d{10,15}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }
    if (!formData.location) newErrors.location = 'Location is required';
    if (formData.role === 'owner' && !formData.business_name) {
      newErrors.business_name = 'Business name is required for property owners';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const response = await api.post('/user/complete-onboarding/', formData);
      const result = response.data;

      if (result.success) {
        hydrateAuth(null, result.user);
        const userRole = result.user?.role;
        switch (userRole) {
          case 'admin': navigate('/admin-dashboard'); break;
          case 'owner': navigate('/owner-dashboard'); break;
          default: navigate('/user-dashboard');
        }
      } else if (result.errors) {
        setErrors(result.errors);
      } else {
        setErrors({ general: 'Failed to complete onboarding. Please try again.' });
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Complete your profile"
      subtitle={`${isNewUser ? 'Welcome to BookMyBox! ' : ''}Just a few more details to get started`}
    >
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
          <option value="user">Sports player</option>
          <option value="owner">Facility owner</option>
        </Select>

        {formData.role === 'owner' && (
          <Input label="Business name" id="business_name" name="business_name" value={formData.business_name} onChange={handleChange} leadingIcon={<BriefcaseBusiness size={18} />} error={errors.business_name} placeholder="Elite Sports Complex" disabled={loading} />
        )}

        <MagneticButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Completing setup…' : 'Complete setup'}
        </MagneticButton>
      </form>
    </AuthShell>
  );
};

export default OnboardingPage;
