import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { ShieldCheck, ShieldAlert, Clock, Upload, FileText } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Loader } from '../ui';

const STATUS_META = {
  not_submitted: { tone: 'neutral', label: 'Not submitted' },
  pending: { tone: 'warning', label: 'Pending review' },
  approved: { tone: 'success', label: 'Verified' },
  rejected: { tone: 'danger', label: 'Rejected' },
};

/**
 * Owner-facing submission form for identity/business (PAN/GST + document)
 * verification. Mirrors OwnerBoxViewSet's submit -> pending -> admin review
 * pattern: GET /user/owner/verification/ returns (and lazily creates, in
 * 'not_submitted' state) this owner's row; POST resubmits it to 'pending'.
 *
 * Deliberately its own tab rather than a banner on Overview — this keeps
 * the addition isolated from other in-flight work on OwnerDashboard's
 * Overview section, same reasoning as OwnerRewardsTab being its own tab.
 *
 * File upload uses the same "clear the default JSON Content-Type so the
 * browser sets the multipart boundary" pattern as Profile.jsx's avatar
 * upload (see api.jsx's updateProfile for the original fix) — api's axios
 * instance hardcodes application/json otherwise, which would silently send
 * the document as an empty/invalid multipart body.
 */
export default function OwnerVerificationTab() {
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ pan_number: '', gst_number: '' });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/user/owner/verification/');
      setVerification(res.data);
      setForm({ pan_number: res.data.pan_number || '', gst_number: res.data.gst_number || '' });
    } catch {
      toast.error('Failed to load verification status');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!file && !verification?.verification_document) {
      toast.error('Please upload a verification document.');
      return;
    }
    setSubmitting(true);
    const body = new FormData();
    body.append('pan_number', form.pan_number);
    body.append('gst_number', form.gst_number);
    if (file) body.append('verification_document', file);
    try {
      const res = await api.post('/user/owner/verification/', body, {
        headers: { 'Content-Type': undefined },
      });
      setVerification(res.data);
      setFile(null);
      toast.success('Verification submitted — an admin will review it shortly.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit verification.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader text="Loading verification status..." className="py-10" />;

  const status = verification?.verification_status || 'not_submitted';
  const meta = STATUS_META[status] || STATUS_META.not_submitted;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-display font-semibold text-foreground">Owner verification</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Optional identity/business verification — helps players trust your listings and gives admins
            more context when reviewing your facilities.
          </p>
        </div>
        <Badge tone={meta.tone} size="md">{meta.label}</Badge>
      </div>

      {status === 'approved' && (
        <Card padding="lg" className="text-center">
          <ShieldCheck size={56} className="mx-auto text-success mb-4" />
          <h4 className="text-xl font-display font-semibold text-foreground mb-2">You&rsquo;re verified</h4>
          <p className="text-muted-foreground">
            Your PAN/GST and document were reviewed and approved
            {verification?.reviewed_at ? ` on ${new Date(verification.reviewed_at).toLocaleDateString()}` : ''}.
          </p>
        </Card>
      )}

      {status === 'pending' && (
        <Card padding="lg" className="text-center">
          <Clock size={56} className="mx-auto text-warning mb-4" />
          <h4 className="text-xl font-display font-semibold text-foreground mb-2">Verification pending review</h4>
          <p className="text-muted-foreground">
            Submitted {verification?.submitted_at ? new Date(verification.submitted_at).toLocaleDateString() : 'recently'}.
            An admin will review your details soon.
          </p>
        </Card>
      )}

      {(status === 'not_submitted' || status === 'rejected') && (
        <Card padding="lg">
          {status === 'rejected' && (
            <div className="mb-5 p-4 rounded-lg bg-danger/10 border border-danger/30 flex gap-3">
              <ShieldAlert size={20} className="text-danger shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Your verification was rejected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {verification?.rejection_reason || 'No reason given.'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Fix the details below and resubmit.</p>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <Input
              label="PAN number"
              value={form.pan_number}
              onChange={(e) => setForm((f) => ({ ...f, pan_number: e.target.value.toUpperCase() }))}
              placeholder="ABCDE1234F"
            />
            <Input
              label="GST number (optional)"
              value={form.gst_number}
              onChange={(e) => setForm((f) => ({ ...f, gst_number: e.target.value.toUpperCase() }))}
              placeholder="22ABCDE1234F1Z5"
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Verification document</label>
              <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-input cursor-pointer hover:bg-elevated transition-colors">
                <Upload size={18} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {file ? file.name : (verification?.verification_document ? 'Replace uploaded document' : 'Choose a file to upload')}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              {verification?.verification_document && !file && (
                <a
                  href={verification.verification_document}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary mt-2"
                >
                  <FileText size={14} /> View currently uploaded document
                </a>
              )}
            </div>
            <Button onClick={handleSubmit} loading={submitting} fullWidth>
              {status === 'rejected' ? 'Resubmit for review' : 'Submit for verification'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
