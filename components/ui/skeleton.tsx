import { cn } from "@/lib/utils";

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 lg:gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="aspect-square rounded-lg bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse space-y-4", className)}>
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  );
}
