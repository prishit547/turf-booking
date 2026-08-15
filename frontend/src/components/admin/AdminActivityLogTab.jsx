import { useState, useEffect, useCallback, Fragment } from 'react';
import { toast } from 'react-toastify';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { api } from '../../api.jsx';
import { Card, Badge, Loader, Pagination, Select } from '../ui';

const PAGE_SIZE = 20;

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
};

// Coarse color grouping by action prefix (user./box./payout.) rather than a
// per-action map — new action strings (e.g. a future 'coupon.delete') pick
// up a sane default tone automatically instead of needing this file touched
// every time log_admin_action() gains a new call site.
const actionTone = (action) => {
  if (action?.startsWith('user.delete')) return 'danger';
  if (action?.startsWith('user.')) return 'primary';
  if (action?.startsWith('box.approve')) return 'success';
  if (action?.startsWith('box.reject')) return 'danger';
  if (action?.startsWith('box.')) return 'warning';
  if (action?.startsWith('payout.')) return 'secondary';
  return 'neutral';
};

/**
 * Admin-only, read-only audit trail of admin actions with real consequences
 * (user edit/create/delete, box approve/reject, payout record) — backs
 * GET /user/admin/action-log/. Kept as its own tab/component (like
 * AdminRewardsTab, AdminCommissionTab, AdminVerificationTab) rather than
 * folded into AdminDashboard.jsx directly, to stay isolated from the
 * parallel Verifications tab also landing in AdminDashboard.jsx this round.
 */
export default function AdminActivityLogTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [result, setResult] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (actionFilter) params.action = actionFilter;
      const res = await api.get('/user/admin/action-log/', { params });
      setResult({ results: res.data.results || [], count: res.data.count || 0 });
    } catch {
      toast.error('Failed to load the activity log');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);
  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever the filter changes, not on page change itself
  // (same pattern as the Users/Bookings tabs elsewhere in this dashboard).
  useEffect(() => { setPage(1); }, [actionFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-display font-semibold text-foreground">Activity log</h3>
          <p className="text-sm text-muted-foreground mt-1">
            A queryable record of admin actions with real consequences — who did what, and when.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All actions</option>
            <option value="user.update">User updated</option>
            <option value="user.create">User created</option>
            <option value="user.delete">User deleted</option>
            <option value="box.approve">Box approved</option>
            <option value="box.reject">Box rejected</option>
            <option value="box.request_changes">Box changes requested</option>
            <option value="payout.record">Payout recorded</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <Loader text="Loading activity log..." className="py-10" />
      ) : result.results.length === 0 ? (
        <Card padding="lg" className="text-center">
          <History size={56} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">No activity yet</h3>
          <p className="text-muted-foreground">Admin actions like user edits, box approvals, and payouts will show up here.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated">
                <tr>
                  {['When', 'Actor', 'Action', 'Target', 'Details'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.results.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const hasDetails = entry.details && Object.keys(entry.details).length > 0;
                  return (
                    <Fragment key={entry.id}>
                      <tr className="hover:bg-elevated/60 transition-colors">
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                        <td className="py-3 px-4 text-foreground whitespace-nowrap">{entry.actor_email || 'Deleted admin'}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge tone={actionTone(entry.action)} size="sm">{entry.action}</Badge>
                        </td>
                        <td className="py-3 px-4 text-foreground whitespace-nowrap">
                          {entry.target_type ? `${entry.target_type} #${entry.target_id}` : '—'}
                          {entry.target_repr && (
                            <div className="text-xs text-muted-foreground">{entry.target_repr}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                            >
                              {isExpanded ? 'Hide' : 'View'}
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasDetails && (
                        <tr>
                          <td colSpan={5} className="bg-elevated/40 px-4 py-3">
                            <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={result.count} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
}
