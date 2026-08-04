import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/store";

export function StatusPill({ status, className }: { status: BookingStatus | "ongoing"; className?: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-primary/15 text-primary",
    ongoing: "bg-turf/20 text-turf",
    completed: "bg-elevated text-muted-foreground",
    cancelled: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        map[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
