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
 */
export function SlotGrid({ timeSlots, selectedTimeSlot, onSelect, isTimeSlotBooked, isTimeSlotAvailable, loading, duration = 1 }) {
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
                const isSelected = selectedTimeSlot === time;
                const canSelect = !isBooked && isTimeSlotAvailable(time);

                return (
                    <motion.button
                        key={time}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.015 }}
                        whileHover={canSelect ? { scale: 1.03 } : undefined}
                        onClick={() => (canSelect ? onSelect(time) : null)}
                        disabled={isBooked || !canSelect}
                        className={`p-2 text-sm rounded-lg border transition-colors duration-150 ${
                            isBooked
                                ? 'slot-strike bg-danger/10 text-danger border-danger/30 cursor-not-allowed'
                                : isSelected
                                ? 'slot-selected bg-primary text-primary-foreground border-primary'
                                : canSelect
                                ? 'bg-elevated text-foreground border-border hover:border-primary hover:bg-primary/10'
                                : 'slot-strike bg-elevated/60 text-muted-foreground border-border cursor-not-allowed'
                        }`}
                        title={isBooked ? 'This time slot is already booked' : canSelect ? 'Available' : 'Not available for selected duration'}
                    >
                        {time} - {addHours(time, duration)}
                        {isBooked && <div className="text-xs mt-1 font-medium">Booked</div>}
                    </motion.button>
                );
            })}
        </div>
    );
}

/** Static legend row for the slot grid's three visual states. */
export function SlotLegend() {
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
        </div>
    );
}
