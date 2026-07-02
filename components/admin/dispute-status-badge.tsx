import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  processing: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  completed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  closed: "bg-muted text-muted-foreground",
  canceled: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  rejected: "bg-red-500/15 text-red-800 dark:text-red-200",
};

export function DisputeStatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[key] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
