import { cn } from "@/lib/utils";

export function ShimmerBlock({ className }: { className?: string }) {
  return <div className={cn("bmb-shimmer rounded-xl", className)} />;
}

export function VenueCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <ShimmerBlock className="h-44 w-full rounded-none" />
      <div className="space-y-3 p-4">
        <ShimmerBlock className="h-4 w-2/3" />
        <ShimmerBlock className="h-3 w-1/2" />
        <div className="flex gap-2">
          <ShimmerBlock className="h-6 w-20 rounded-full" />
          <ShimmerBlock className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SlotGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <ShimmerBlock key={i} className="h-16" />
      ))}
    </div>
  );
}
