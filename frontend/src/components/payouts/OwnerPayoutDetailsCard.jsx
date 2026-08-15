import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Landmark, Info, CheckCircle2 } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Loader } from '../ui';

/**
 * Owner-facing view/edit of where their payouts should be sent (bank
 * account or UPI). Deliberately its own card at the top of OwnerDashboard's
 * Payouts tab, not a gate on anything — GET /user/owner/payout-details/
 * lazily creates an empty row (see user/views.py's OwnerPayoutDetailsView),
 * and every field here is optional. The only validation (mirrored
 * client-side, enforced server-side by OwnerPayoutDetailsSerializer) is
 * that bank_account_number/ifsc_code must be filled together.
 */
export default function OwnerPayoutDetailsCard() {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    account_holder_name: '', bank_account_number: '', ifsc_code: '', upi_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/user/owner/payout-details/');
      setDetails(res.data);
      setForm({
        account_holder_name: res.data.account_holder_name || '',
        bank_account_number: res.data.bank_account_number || '',
        ifsc_code: res.data.ifsc_code || '',
        upi_id: res.data.upi_id || '',
      });
    } catch {
      toast.error('Failed to load payout details');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (formError) setFormError('');
  };

  const handleSave = async () => {
    if (Boolean(form.bank_account_number) !== Boolean(form.ifsc_code)) {
      setFormError('Provide both a bank account number and an IFSC code together, or leave both blank.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await api.patch('/user/owner/payout-details/', form);
      setDetails(res.data);
      toast.success('Payout details saved');
    } catch (err) {
      const detail = err.response?.data;
      const message = Array.isArray(detail?.non_field_errors)
        ? detail.non_field_errors.join(' ')
        : (detail?.detail || 'Failed to save payout details');
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader text="Loading payout details..." className="py-10" />;

  const isComplete = Boolean(details?.upi_id) || Boolean(details?.bank_account_number && details?.ifsc_code);

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Landmark size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-display font-semibold text-foreground">Payout details</h3>
            <p className="text-sm text-muted-foreground">Where we should send your payouts.</p>
          </div>
        </div>
        <Badge tone={isComplete ? 'success' : 'neutral'} size="md">
          {isComplete ? 'On file' : 'Not set'}
        </Badge>
      </div>

      {!isComplete && (
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 flex gap-3">
          <Info size={20} className="text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Add your bank or UPI details so we know where to send your payouts. This is optional —
            you can keep using your dashboard and taking bookings without it, and add it any time.
          </p>
        </div>
      )}
      {isComplete && (
        <div className="p-3 rounded-lg bg-success/5 border border-success/20 flex gap-2.5 items-center">
          <CheckCircle2 size={16} className="text-success shrink-0" />
          <p className="text-xs text-muted-foreground">
            Last updated {details?.updated_at ? new Date(details.updated_at).toLocaleDateString() : 'recently'}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Account holder name (optional)"
          value={form.account_holder_name}
          onChange={handleChange('account_holder_name')}
          placeholder="As per bank records"
        />
        <Input
          label="UPI ID (optional)"
          value={form.upi_id}
          onChange={handleChange('upi_id')}
          placeholder="yourname@upi"
        />
        <Input
          label="Bank account number"
          value={form.bank_account_number}
          onChange={handleChange('bank_account_number')}
          placeholder="1234567890123"
        />
        <Input
          label="IFSC code"
          value={form.ifsc_code}
          onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))}
          placeholder="HDFC0001234"
        />
      </div>
      {formError && <p className="text-sm text-danger">{formError}</p>}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Save payout details</Button>
      </div>
    </Card>
  );
}
