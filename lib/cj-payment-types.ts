export type CjPaymentStatus = "unpaid" | "paid" | "not_required";

export type CjAutoPayOutcome = "success" | "failed" | "cap_blocked";

export const CJ_ORDERS_DASHBOARD_URL =
  "https://cjdropshipping.com/mine/purchase/purchaseList";

/** Deep-link style URL — CJ may redirect; list page is the reliable fallback. */
export function cjOrderPaymentUrl(
  cjOrderId: string | null,
  shipmentOrderId?: string | null
): string {
  const id = shipmentOrderId?.trim() || cjOrderId?.trim();
  if (!id) return CJ_ORDERS_DASHBOARD_URL;
  return `https://cjdropshipping.com/mine/purchase/purchaseList?orderId=${encodeURIComponent(id)}`;
}
