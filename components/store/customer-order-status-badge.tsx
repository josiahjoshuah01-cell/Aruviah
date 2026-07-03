import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  customerOrderBadgeClass,
  getCustomerOrderDisplay,
  type OrderStatusInput,
} from "@/lib/order-status-display";

export function CustomerOrderStatusBadge({
  order,
}: {
  order: OrderStatusInput;
}) {
  const { label } = getCustomerOrderDisplay(order);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
        customerOrderBadgeClass(label)
      )}
    >
      {label}
    </span>
  );
}
