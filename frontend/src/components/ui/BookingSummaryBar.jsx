import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './Button';

/**
 * Sticky bottom bar shown once a time slot is selected — summarizes the
 * pick and hands off to the reservation flow (reserveSlot → Checkout).
 */
export function BookingSummaryBar({
    visible, boxName, date, timeSlot, duration, total, onContinue, loading,
    buttonLabel = 'Continue to book', loadingLabel = 'Checking availability...',
}) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: 120, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 120, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{boxName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                                {date} · {timeSlot} · {duration} hour{duration > 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right hidden sm:block">
                                <div className="text-xs text-muted-foreground">Total</div>
                                <div className="font-display font-bold text-lg text-primary">₹{total}</div>
                            </div>
                            <Button onClick={onContinue} loading={loading} disabled={loading}>
                                {loading ? loadingLabel : buttonLabel}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
