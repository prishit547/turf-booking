import { sports, type SportId } from "@/data/mock";
import { SportIcon } from "@/components/SportIcon";
import { cn } from "@/lib/utils";

export function SportBadge({
  sport,
  className,
  tone = "muted",
}: {
  sport: SportId;
  className?: string;
  tone?: "muted" | "turf" | "accent";
}) {
  const name = sports.find((s) => s.id === sport)?.name ?? sport;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "muted" && "bg-elevated text-muted-foreground",
        tone === "turf" && "bg-turf/15 text-turf",
        tone === "accent" && "bg-primary/15 text-primary",
        className,
      )}
    >
      <SportIcon sport={sport} className="h-3.5 w-3.5" />
      {name}
    </span>
  );
}
