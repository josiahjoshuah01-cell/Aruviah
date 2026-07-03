/**
 * Customer-facing order status labels — never expose internal fulfillment states.
 */

export type CustomerOrderStage = "placed" | "processing" | "shipped" | "delivered";

export type CustomerOrderDisplay = {
  label: string;
  description: string;
  stage: CustomerOrderStage;
};

export type OrderStatusInput = {
  status: string;
  cj_track_number?: string | null;
  cj_tracking_status?: string | null;
};

function normalizeTrackingStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isDelivered(trackingStatus: string, orderStatus: string): boolean {
  if (trackingStatus.includes("deliver")) return true;
  return orderStatus === "shipped" && trackingStatus === "delivered";
}

function isOutForDelivery(trackingStatus: string): boolean {
  return (
    trackingStatus.includes("out for delivery") ||
    trackingStatus.includes("out-for-delivery") ||
    trackingStatus.includes("outfordelivery")
  );
}

function isInTransit(trackingStatus: string, hasTrackNumber: boolean): boolean {
  if (!hasTrackNumber && !trackingStatus) return false;
  return (
    trackingStatus.includes("transit") ||
    trackingStatus.includes("shipped") ||
    trackingStatus.includes("picked") ||
    trackingStatus.includes("departed") ||
    trackingStatus.includes("arrived") ||
    hasTrackNumber
  );
}

const PROCESSING_STATUSES = new Set([
  "pending",
  "paid",
  "fulfilling",
  "paid_needs_manual_fulfillment",
  "paid_fulfillment_pending",
]);

export function getCustomerOrderDisplay(
  order: OrderStatusInput
): CustomerOrderDisplay {
  const orderStatus = order.status.trim().toLowerCase();
  const trackingStatus = normalizeTrackingStatus(order.cj_tracking_status);
  const hasTrackNumber = !!order.cj_track_number?.trim();

  if (orderStatus === "refunded") {
    return {
      label: "Refunded",
      description: "This order has been refunded.",
      stage: "delivered",
    };
  }

  if (orderStatus === "failed") {
    return {
      label: "Cancelled",
      description: "This order could not be completed.",
      stage: "placed",
    };
  }

  if (isDelivered(trackingStatus, orderStatus)) {
    return {
      label: "Delivered",
      description: "Your package has been delivered.",
      stage: "delivered",
    };
  }

  if (isOutForDelivery(trackingStatus)) {
    return {
      label: "Out for delivery",
      description: "Your package is on its way to you today.",
      stage: "shipped",
    };
  }

  if (
    orderStatus === "shipped" ||
    isInTransit(trackingStatus, hasTrackNumber)
  ) {
    const label =
      trackingStatus && !trackingStatus.includes("deliver")
        ? titleCaseTrackingStatus(order.cj_tracking_status!)
        : "Shipped";
    return {
      label,
      description: "Your order is on the way.",
      stage: "shipped",
    };
  }

  if (PROCESSING_STATUSES.has(orderStatus) || !hasTrackNumber) {
    return {
      label: "Processing",
      description: "We're preparing your order for shipment.",
      stage: "processing",
    };
  }

  return {
    label: "Processing",
    description: "We're preparing your order for shipment.",
    stage: "processing",
  };
}

function titleCaseTrackingStatus(status: string): string {
  return status
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function customerOrderBadgeClass(label: string): string {
  switch (label) {
    case "Delivered":
      return "bg-stream/15 text-stream";
    case "Shipped":
    case "Out for delivery":
      return "bg-stream/10 text-stream";
    case "Processing":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-400";
    case "Refunded":
    case "Cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function customerOrderTimelineIndex(stage: CustomerOrderStage): number {
  switch (stage) {
    case "placed":
      return 0;
    case "processing":
      return 1;
    case "shipped":
      return 2;
    case "delivered":
      return 3;
  }
}
