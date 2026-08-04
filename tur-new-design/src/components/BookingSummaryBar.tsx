import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { formatHour } from "@/data/mock";
import { inr } from "@/lib/store";

export function BookingSummaryBar({
  hours,
  total,
  dateLabel,
  onContinue,
  ctaLabel = "Continue to book",
}: {
  hours: number[];
  total: number;
  dateLabel: string;
  onContinue: () => void;
  ctaLabel?: string;
}) {
  const sorted = [...hours].sort((a, b) => a - b);
  return (
    <AnimatePresence>
      {sorted.length > 0 && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {sorted.length} slot{sorted.length > 1 ? "s" : ""} · {dateLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {sorted.map((h) => formatHour(h)).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="font-display text-xl">{inr(total)}</p>
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition hover:bg-primary/90"
              >
                {ctaLabel} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
