import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Syncs a dashboard's active tab with a `?tab=` URL param instead of plain
 * component state. Without this, refreshing the page, using browser
 * Back/Forward, or sharing/bookmarking a link into a specific tab (e.g.
 * "here's my Earnings tab") always dumps the user back on the first tab —
 * jarring on pages people live in for a while, like the owner/admin/user
 * dashboards.
 *
 * Tab switches replace the current history entry rather than pushing a new
 * one, so Back takes you out of the dashboard (as expected), not backward
 * one tab at a time.
 */
export function useTabParam(defaultTab, validTabs) {
    const [searchParams, setSearchParams] = useSearchParams();
    const raw = searchParams.get('tab');
    const activeTab = validTabs.includes(raw) ? raw : defaultTab;

    const setActiveTab = useCallback((tab) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    return [activeTab, setActiveTab];
}
