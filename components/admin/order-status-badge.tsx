import { orderStatusBadgeClass, orderStatusLabel } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        orderStatusBadgeClass(status)
      )}
    >
      {orderStatusLabel(status)}
    </span>
  );
}
