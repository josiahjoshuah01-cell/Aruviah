import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  rating,
  max = 5,
  size = "md",
  className,
}: {
  rating: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(rating);
        return (
          <Star
            key={i}
            className={cn(
              iconClass,
              filled
                ? "fill-sun-glint text-sun-glint"
                : "fill-transparent text-muted-foreground/40"
            )}
          />
        );
      })}
    </span>
  );
}
