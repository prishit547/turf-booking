import { useState } from 'react';
import { toast } from 'react-toastify';
import { UserPlus } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { Modal, Input, Button } from '../ui';

/**
 * Group/split-booking invite — shared between UserDashboard.jsx's Bookings
 * tab and BookingConfirmation.jsx's "Invite" action, so the search/send
 * flow (and its backend contract, bookings/views.py's `invite` action)
 * lives in exactly one place. Search finds existing accounts; typing a
 * full email that doesn't match anyone still sends an invite (claimed
 * once they sign up).
 */
export default function InviteBookingModal({ booking, isOpen, onClose, onInvited }) {
  const { searchUsers, inviteToBooking } = useBooking();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [invitingId, setInvitingId] = useState(null);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setInvitingId(null);
    onClose();
  };

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchUsers(value.trim()));
  };

  const sendInvite = async ({ invitedUserId, invitedEmail }) => {
    if (!booking) return;
    const id = invitedUserId || invitedEmail;
    setInvitingId(id);
    const result = await inviteToBooking(booking.id, { invitedUserId, invitedEmail });
    setInvitingId(null);
    if (result.success) {
      toast.success('Invite sent!');
      onInvited?.();
      handleClose();
    } else {
      toast.error(result.error || 'Failed to send invite.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite someone to this booking" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          They&rsquo;ll be able to see this booking&rsquo;s details once they accept.
        </p>
        <Input
          label="Search by name or email"
          placeholder="Type at least 2 characters..."
          value={query}
          onChange={handleSearchChange}
        />

        {results.length > 0 && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => sendInvite({ invitedUserId: result.id })}
                  disabled={invitingId === result.id}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-primary/50 disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{result.name || result.email}</p>
                    <p className="text-xs text-muted-foreground">{result.email}</p>
                  </div>
                  <UserPlus size={16} className="text-primary shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.includes('@') && results.length === 0 && (
          <Button
            fullWidth
            icon={<UserPlus size={16} />}
            loading={invitingId === query.trim()}
            onClick={() => sendInvite({ invitedEmail: query.trim() })}
          >
            Invite {query.trim()}
          </Button>
        )}
      </div>
    </Modal>
  );
}
