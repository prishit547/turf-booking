import { motion } from "motion/react";
import type { Slot } from "@/data/mock";
import { inr } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SlotGrid({
  slots,
  selected,
  onToggle,
}: {
  slots: Slot[];
  selected: number[];
  onToggle: (hour: number) => void;
}) {
  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="font-display text-lg">No slots published for this day</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try another date — owners usually open the calendar a week ahead.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {slots.map((slot, i) => {
        const unavailable = slot.status !== "available";
        const isSelected = selected.includes(slot.hour);
        return (
          <motion.button
            key={slot.hour}
            type="button"
            disabled={unavailable}
            onClick={() => onToggle(slot.hour)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: i * 0.02 }}
            whileHover={unavailable ? {} : { scale: 1.03 }}
            aria-pressed={isSelected}
            aria-label={`${slot.label} ${unavailable ? "unavailable" : `available at ${inr(slot.price)}`}`}
            className={cn(
              "relative rounded-xl border px-2 py-3 text-center transition",
              unavailable && "slot-strike cursor-not-allowed border-border bg-muted/40 text-muted-foreground",
              !unavailable &&
                !isSelected &&
                "border-border bg-card text-foreground hover:border-primary/70 hover:text-primary",
              isSelected && "slot-selected border-primary bg-primary text-primary-foreground",
            )}
          >
            <span className="block text-sm font-semibold">{slot.label}</span>
            <span className={cn("block text-[11px]", isSelected ? "opacity-80" : "text-muted-foreground")}>
              {unavailable ? (slot.status === "booked" ? "Booked" : "Blocked") : inr(slot.price)}
            </span>
            {slot.peak && !unavailable && (
              <span
                className={cn(
                  "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
                  isSelected ? "bg-primary-foreground" : "bg-primary",
                )}
                aria-hidden
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export function SlotLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-border bg-card" /> Available
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-primary" /> Selected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-muted" /> Booked / blocked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Peak hour pricing
      </span>
    </div>
  );
}
