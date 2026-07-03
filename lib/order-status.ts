export const ORDER_STATUSES = [
  "pending",
  "paid",
  "paid_needs_manual_fulfillment",
  "paid_fulfillment_pending",
  "fulfilling",
  "shipped",
  "refunded",
  "failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ADMIN_UPDATABLE_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "paid_needs_manual_fulfillment",
  "paid_fulfillment_pending",
  "shipped",
  "refunded",
  "failed",
];

export const FULFILLMENT_QUEUE_STATUSES: OrderStatus[] = [
  "paid_needs_manual_fulfillment",
  "paid_fulfillment_pending",
];

/** Orders that represent captured payment (revenue / profit metrics). */
export const PAID_PLUS_ORDER_STATUSES: OrderStatus[] = [
  "paid",
  "paid_needs_manual_fulfillment",
  "paid_fulfillment_pending",
  "fulfilling",
  "shipped",
];

export function orderStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "paid":
    case "shipped":
      return "bg-stream/15 text-stream";
    case "pending":
    case "fulfilling":
    case "paid_fulfillment_pending":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "paid_needs_manual_fulfillment":
      return "bg-coral-pulse/15 text-coral-pulse";
    case "refunded":
      return "bg-muted text-muted-foreground";
    case "failed":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}
