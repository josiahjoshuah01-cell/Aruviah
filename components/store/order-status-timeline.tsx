import { cn } from "@/lib/utils";
import {
  customerOrderTimelineIndex,
  getCustomerOrderDisplay,
  type OrderStatusInput,
} from "@/lib/order-status-display";
import { Check } from "lucide-react";

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

export function OrderStatusTimeline({ order }: { order: OrderStatusInput }) {
  const { stage } = getCustomerOrderDisplay(order);
  const activeIndex = customerOrderTimelineIndex(stage);

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:justify-between">
      {STEPS.map((step, index) => {
        const isComplete = index < activeIndex;
        const isCurrent = index === activeIndex;
        const isUpcoming = index > activeIndex;

        return (
          <li
            key={step.key}
            className={cn(
              "relative flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center",
              index < STEPS.length - 1 &&
                "pb-6 sm:pb-0 sm:after:absolute sm:after:left-[calc(50%+1rem)] sm:after:top-4 sm:after:h-px sm:after:w-[calc(100%-2rem)] sm:after:bg-border sm:after:content-['']"
            )}
          >
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                isCurrent &&
                  "border-current bg-current text-mist",
                isComplete && "border-stream bg-stream text-mist",
                isUpcoming &&
                  "border-border bg-muted text-muted-foreground"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isComplete ? (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  isCurrent && "text-current",
                  isComplete && "text-foreground",
                  isUpcoming && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
