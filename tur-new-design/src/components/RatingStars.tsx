import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({
  rating,
  count,
  className,
}: {
  rating: number;
  count?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}
