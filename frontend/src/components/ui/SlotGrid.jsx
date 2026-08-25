import { motion } from 'framer-motion';

/** "09:00" + 2 hours -> "11:00", wrapping is never expected since callers
 * already exclude slots whose duration would run past closing time. */
function addHours(time, hours) {
    const [h] = time.split(':').map(Number);
    return `${((h + hours) % 24).toString().padStart(2, '0')}:00`;
}

/**
 * Time-slot picker grid — extracted from BoxDetails.jsx's inline slot
 * buttons. Preserves the exact availability/selection logic the caller
 * already computes (`isTimeSlotBooked`/`isTimeSlotAvailable`); this
 * component only owns the visual presentation, not the booking rules.
 * Each button shows the full start-end range for the currently selected
 * `duration` rather than just a bare start time, since a single time like
 * "09:00" doesn't tell the user when the booking would end.
 *
 * A booked slot renders as a non-disabled wrapper `div` (not a `<button
 * disabled>`) so it can host a working nested "Notify me" button — a real
 * nested `<button>` inside a disabled one never receives clicks.
 */
export function SlotGrid({
    timeSlots, selectedTimeSlot, onSelect, isTimeSlotBooked, isTimeSlotAvailable, isTimeSlotPast, loading, duration = 1,
    waitlistedSlots, onToggleWaitlist, waitlistPending,
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading available slots...
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto sm:grid-cols-3">
            {timeSlots.map((time, i) => {
                const isBooked = isTimeSlotBooked(time);
                const isPast = !isBooked && isTimeSlotPast?.(time);
                const isSelected = selectedTimeSlot === time;
                const canSelect = !isBooked && !isPast && isTimeSlotAvailable(time);

                if (isPast) {
                    return (
                        <motion.div
                            key={time}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.015 }}
                            className="p-2 text-sm rounded-lg border border-border/60 bg-transparent text-muted-foreground/60 flex flex-col items-center gap-0.5 cursor-not-allowed"
                            title="This time has already passed"
                        >
                            <span>{time} - {addHours(time, duration)}</span>
                            <span className="text-xs font-medium uppercase tracking-wide">Past</span>
                        </motion.div>
                    );
                }

                if (isBooked) {
                    const isWaitlisted = waitlistedSlots?.has(time);
                    const isPending = waitlistPending?.has(time);
                    return (
                        <motion.div
                            key={time}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.015 }}
                            className="slot-strike p-2 text-sm rounded-lg border bg-danger/10 text-danger border-danger/30 flex flex-col items-center gap-1"
                        >
                            <span>{time} - {addHours(time, duration)}</span>
                            {onToggleWaitlist ? (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onToggleWaitlist(time); }}
                                    disabled={isPending}
                                    className={`text-xs font-medium underline decoration-dotted disabled:opacity-50 ${
                                        isWaitlisted ? 'text-success' : 'text-danger/80 hover:text-danger'
                                    }`}
                                >
                                    {isWaitlisted ? 'On waitlist ✓' : 'Notify me'}
                                </button>
                            ) : (
                                <span className="text-xs font-medium">Booked</span>
                            )}
                        </motion.div>
                    );
                }

                return (
                    <motion.button
                        key={time}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.015 }}
                        whileHover={canSelect ? { scale: 1.03 } : undefined}
                        onClick={() => (canSelect ? onSelect(time) : null)}
                        disabled={!canSelect}
                        className={`p-2 text-sm rounded-lg border transition-colors duration-150 ${
                            isSelected
                                ? 'slot-selected bg-primary text-primary-foreground border-primary'
                                : canSelect
                                ? 'bg-elevated text-foreground border-border hover:border-primary hover:bg-primary/10'
                                : 'slot-strike bg-elevated/60 text-muted-foreground border-border cursor-not-allowed'
                        }`}
                        title={canSelect ? 'Available' : 'Not available for selected duration'}
                    >
                        {time} - {addHours(time, duration)}
                    </motion.button>
                );
            })}
        </div>
    );
}

/** Static legend row for the slot grid's visual states. `showPast` adds the
 * fourth "already elapsed" state — only relevant when the picker is showing
 * today, so callers viewing a future date can leave it off. */
export function SlotLegend({ showPast = false }) {
    return (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-elevated border border-border rounded" />
                Available
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-primary rounded" />
                Selected
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-danger/10 border border-danger/30 rounded" />
                Booked
            </div>
            {showPast && (
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-transparent border border-border/60 rounded" />
                    Past
                </div>
            )}
        </div>
    );
}
