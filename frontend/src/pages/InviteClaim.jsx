import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, UserPlus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../api.jsx';
import { useBooking } from '../context/BookingContext';
import { AuthShell } from '../components/auth/AuthShell';
import { Button, Loader } from '../components/ui';

export const PENDING_INVITE_KEY = 'pendingInviteToken';

/**
 * Landing page for an emailed/in-app booking-invite link. Works for both
 * an unauthenticated visitor (shows what the invite is for, then bounces
 * to login/signup, stashing the token so it can be resumed there — see
 * Login.jsx/Signup.jsx's post-auth check for PENDING_INVITE_KEY) and an
 * authenticated one (accept/decline directly).
 */
const InviteClaim = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { getInviteDetail, respondToInvite } = useBooking();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInviteDetail(token).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setInvite(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, getInviteDetail]);

  const goToAuth = (path) => {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    navigate(path);
  };

  const handleRespond = async (action) => {
    setResponding(true);
    const result = await respondToInvite(token, action);
    setResponding(false);
    if (result.success) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      if (action === 'accept') {
        toast.success("You're in! This booking now shows in your dashboard.");
        navigate('/user-dashboard');
      } else {
        toast.info("You've declined the invite.");
        navigate('/');
      }
    } else {
      toast.error(result.error || `Could not ${action} this invite.`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader text="Loading invite..." />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <AuthShell title="Invite not found" subtitle="This link may be invalid.">
        <Link to="/" className="text-sm font-medium text-primary hover:text-primary/80">Back to home</Link>
      </AuthShell>
    );
  }

  if (!invite.valid) {
    return (
      <AuthShell
        title={invite.status === 'accepted' ? 'Already accepted' : invite.status === 'declined' ? 'Invite declined' : 'Invite expired'}
        subtitle={
          invite.status === 'accepted'
            ? 'This invite has already been accepted.'
            : invite.status === 'declined'
            ? 'This invite was declined and is no longer active.'
            : 'This invite link has expired.'
        }
      >
        <Link to="/" className="text-sm font-medium text-primary hover:text-primary/80">Back to home</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="You're invited!"
      subtitle={`${invite.invited_by_name} invited you to join their booking`}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-elevated p-4 space-y-2 text-sm">
          <p className="flex items-center gap-2 text-foreground font-medium">
            <MapPin size={16} className="text-primary" /> {invite.box_name}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={16} /> {new Date(invite.date).toLocaleDateString()}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock size={16} /> {invite.start_time} · {invite.duration}h
          </p>
        </div>

        {isAuthenticated ? (
          <div className="flex gap-3">
            <Button variant="outline" fullWidth icon={<X size={16} />} disabled={responding} onClick={() => handleRespond('decline')}>
              Decline
            </Button>
            <Button fullWidth icon={<UserPlus size={16} />} loading={responding} onClick={() => handleRespond('accept')}>
              Accept
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Sign in or create an account to respond.</p>
            <Button fullWidth onClick={() => goToAuth('/login')}>Sign in</Button>
            <Button fullWidth variant="outline" onClick={() => goToAuth('/signup')}>Create account</Button>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default InviteClaim;
