import { format, isToday } from "date-fns";
import { motion } from "motion/react";
import { nextDays, toISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function DateStrip({
  value,
  onChange,
  days = 14,
}: {
  value: string;
  onChange: (iso: string) => void;
  days?: number;
}) {
  const dates = nextDays(days);

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dates.map((date) => {
        const iso = toISO(date);
        const active = iso === value;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            aria-pressed={active}
            className={cn(
              "relative min-w-16 shrink-0 rounded-xl border px-3 py-2 text-center transition",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/60",
            )}
          >
            <span className="block text-[11px] uppercase tracking-wide opacity-75">
              {isToday(date) ? "Today" : format(date, "EEE")}
            </span>
            <span className="block font-display text-lg leading-tight">{format(date, "d")}</span>
            <span className="block text-[11px] opacity-75">{format(date, "MMM")}</span>
            {active && (
              <motion.span
                layoutId="date-underline"
                className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
