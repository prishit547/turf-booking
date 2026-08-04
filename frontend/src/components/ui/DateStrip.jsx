import { motion } from 'framer-motion';
import { formatLocalDate } from '../../utils/date';

function buildDays(count) {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        days.push(d);
    }
    return days;
}

/**
 * Horizontal scrollable date-pill strip — replaces the react-calendar
 * month-grid widget. The active pill gets a shared-layout underline
 * (`layoutId`) so it animates smoothly between dates instead of just
 * snapping.
 */
export function DateStrip({ selectedDate, onSelectDate, days = 14 }) {
    const options = buildDays(days);
    const selectedKey = formatLocalDate(selectedDate);

    return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {options.map((day, i) => {
                const key = formatLocalDate(day);
                const isSelected = key === selectedKey;
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
                            {i === 0 ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="font-display font-bold text-lg leading-none mt-1">
                            {day.getDate()}
                        </span>
                        {isSelected && (
                            <motion.div
                                layoutId="date-strip-underline"
                                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-primary"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
