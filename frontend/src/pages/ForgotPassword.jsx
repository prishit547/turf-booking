import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { api } from '../api.jsx';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui';
import { MagneticButton } from '../components/motion/MagneticButton';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/user/password-reset/', { email });
      setSent(true);
    } catch (err) {
      // The backend always returns success (to avoid leaking which emails
      // are registered) — a throttled or network/server error is the only
      // real failure case.
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <>
        <Helmet>
          <title>Forgot Password | BoxNplay</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <AuthShell title="Check your email" subtitle="If that email is registered, we've sent a link to reset your password.">
          <p className="text-sm text-muted-foreground">
            The link expires in 45 minutes. Didn&apos;t get it? Check spam, or{' '}
            <button type="button" onClick={() => setSent(false)} className="font-medium text-primary hover:text-primary/80">
              try again
            </button>.
          </p>
          <p className="mt-5 text-center text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
          </p>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Forgot Password | BoxNplay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AuthShell title="Forgot password" subtitle="Enter your email and we'll send you a link to reset it">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-danger/10 border border-danger/30 rounded-lg p-4"
          >
            <p className="text-sm text-danger font-medium">{error}</p>
          </motion.div>
        )}

        <Input
          label="Email address"
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
          leadingIcon={<Mail size={18} />}
          placeholder="Enter your email"
          disabled={loading}
        />

        <MagneticButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending…' : 'Send reset link'}
        </MagneticButton>

        <p className="text-center text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
        </p>
      </form>
      </AuthShell>
    </>
  );
};

export default ForgotPassword;
