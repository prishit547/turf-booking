import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

/**
 * Prev/next pager for DRF's PageNumberPagination response shape
 * ({count, next, previous}) plus the current page number the caller is
 * tracking locally (DRF's response doesn't echo back the page number).
 */
export function Pagination({ page, pageSize, count, onPageChange }) {
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} &middot; {count} total
            </p>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    icon={<ChevronLeft size={16} />}
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    Prev
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    iconRight={<ChevronRight size={16} />}
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
