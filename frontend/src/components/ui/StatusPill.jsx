import { Badge } from './Badge';

// Semantic status -> Badge tone, case-insensitive. Covers booking statuses
// (confirmed/cancelled/completed/pending) and box-approval statuses
// (approved/rejected/pending) with one shared mapping.
const STATUS_TONE = {
    confirmed: 'primary',
    approved: 'primary',
    active: 'primary',
    ongoing: 'success',
    completed: 'neutral',
    pending: 'warning',
    cancelled: 'danger',
    rejected: 'danger',
    failed: 'danger',
};

/** Small uppercase status pill, color-coded by semantic booking/approval status. */
export function StatusPill({ status, className = '' }) {
    const key = String(status || '').toLowerCase();
    return (
        <Badge tone={STATUS_TONE[key] || 'neutral'} size="sm" className={`uppercase tracking-wide ${className}`}>
            {status}
        </Badge>
    );
}
