import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { CheckCircle, X, FileText, ShieldCheck } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Modal, Loader, Pagination } from '../ui';

const PAGE_SIZE = 20;

const formatDate = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
};

/**
 * Admin-only review queue for owner identity/business (PAN/GST + document)
 * verification. Deliberately structured like AdminDashboard's Box Approvals
 * tab (table + approve button + reject-with-reason modal) for consistency
 * with how this app already does review workflows — see
 * AdminBoxViewSet/the "Box Approvals" tab this mirrors.
 *
 * Kept as its own tab/component (like AdminRewardsTab, AdminCommissionTab)
 * rather than folded into AdminDashboard.jsx directly, so this addition
 * stays isolated from the separate Activity Log tab also landing in
 * AdminDashboard.jsx this round.
 */
export default function AdminVerificationTab() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/user/admin/verifications/pending/', { params: { page, page_size: PAGE_SIZE } });
      setResult({ results: res.data.results || [], count: res.data.count || 0 });
    } catch {
      toast.error('Failed to load pending verifications');
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  const handleApprove = async (verification) => {
    setApprovingId(verification.id);
    try {
      await api.post(`/user/admin/verifications/${verification.id}/approve/`);
      toast.success(`${verification.owner_name} is now verified`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve verification');
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectModal = (verification) => {
    setRejectTarget(verification);
    setRejectReason('');
  };
  const closeRejectModal = () => {
    setRejectTarget(null);
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please explain why this verification is being rejected.');
      return;
    }
    setRejecting(true);
    try {
      await api.post(`/user/admin/verifications/${rejectTarget.id}/reject/`, { reason: rejectReason });
      toast.success('Verification rejected');
      closeRejectModal();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject verification');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-display font-semibold text-foreground">Owner verifications</h3>
        <span className="text-sm text-muted-foreground">
          {result.count} pending review{result.count !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <Loader text="Loading pending verifications..." className="py-10" />
      ) : result.results.length === 0 ? (
        <Card padding="lg" className="text-center">
          <ShieldCheck size={56} className="mx-auto text-success mb-4" />
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">All caught up</h3>
          <p className="text-muted-foreground">No owner verifications pending review right now.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated">
                <tr>
                  {['Owner', 'PAN', 'GST', 'Document', 'Submitted', 'Actions'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.results.map((v) => (
                  <tr key={v.id} className="hover:bg-elevated/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground whitespace-nowrap">{v.owner_name}</div>
                      <div className="text-xs text-muted-foreground">{v.owner_email}</div>
                    </td>
                    <td className="py-3 px-4 text-foreground whitespace-nowrap">{v.pan_number || '—'}</td>
                    <td className="py-3 px-4 text-foreground whitespace-nowrap">{v.gst_number || '—'}</td>
                    <td className="py-3 px-4">
                      {v.verification_document ? (
                        <a
                          href={v.verification_document}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-primary hover:underline whitespace-nowrap"
                        >
                          <FileText size={14} /> View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDate(v.submitted_at)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<X size={14} />}
                          onClick={() => openRejectModal(v)}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          icon={<CheckCircle size={14} />}
                          loading={approvingId === v.id}
                          onClick={() => handleApprove(v)}
                        >
                          Approve
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={result.count} onPageChange={setPage} />
        </Card>
      )}

      <Modal
        isOpen={!!rejectTarget}
        onClose={closeRejectModal}
        title="Reject owner verification"
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeRejectModal}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} loading={rejecting}>Reject verification</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Reject the verification submitted by{' '}
            <span className="font-semibold text-foreground">{rejectTarget?.owner_name}</span>?
            They&rsquo;ll be notified and can resubmit.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="verification-rejection-reason" className="block text-sm font-medium text-foreground">
              Rejection reason
            </label>
            <textarea
              id="verification-rejection-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="e.g. The uploaded document is unreadable, please re-upload a clearer copy..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Small badge used inline in the Box Approvals tab to surface the owner's
// verification state next to their name — informational only, never gates
// approve/reject (see boxes/serializers.py's AdminBoxSerializer docstring
// for why box approval deliberately doesn't hard-check this).
const OWNER_VERIFICATION_BADGE_META = {
  approved: { tone: 'success', label: 'Verified' },
  pending: { tone: 'warning', label: 'Verification pending' },
  rejected: { tone: 'danger', label: 'Verification rejected' },
  not_submitted: { tone: 'neutral', label: 'Not verified' },
};

export function OwnerVerificationBadge({ status }) {
  const meta = OWNER_VERIFICATION_BADGE_META[status] || OWNER_VERIFICATION_BADGE_META.not_submitted;
  return <Badge tone={meta.tone} size="sm">{meta.label}</Badge>;
}
