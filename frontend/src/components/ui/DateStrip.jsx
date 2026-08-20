import { motion } from 'framer-motion';
import { formatLocalDate } from '../../utils/date';

function buildDays(count, startOffset) {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + startOffset + i);
        days.push(d);
    }
    return days;
}

/**
 * Horizontal scrollable date-pill strip — replaces the react-calendar
 * month-grid widget. The active pill gets a shared-layout underline
 * (`layoutId`) so it animates smoothly between dates instead of just
 * snapping. `startOffset` lets a caller start the strip before today (e.g.
 * -1 to include yesterday) — the customer booking flow never needs this
 * (defaults to 0, today-forward only), but the owner's schedule tab does.
 */
export function DateStrip({ selectedDate, onSelectDate, days = 14, startOffset = 0 }) {
    const options = buildDays(days, startOffset);
    const selectedKey = formatLocalDate(selectedDate);
    const todayKey = formatLocalDate(new Date());

    return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {options.map((day) => {
                const key = formatLocalDate(day);
                const isSelected = key === selectedKey;
                const isToday = key === todayKey;
                return (
                    <button
                        key={key}
                        onClick={() => onSelectDate(day)}
                        className={`relative shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-xl border transition-colors ${
                            isSelected
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                    >
                        <span className="text-[10px] uppercase tracking-wide">
                            {isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="font-display font-bold text-lg leading-none mt-1">
                            {day.getDate()}
                        </span>
                        {isSelected && (
                            <motion.div
                                layoutId="date-strip-underline"
                                className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-primary"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
