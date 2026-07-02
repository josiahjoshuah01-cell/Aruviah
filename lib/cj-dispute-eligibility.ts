/**
 * CJ disputes only work for orders created via createOrderV2 (API).
 * Unmapped-SKU / manual orders have no cj_order_id; legacy placeholder
 * catalog orders were never API-created and must be excluded.
 */

const CJ_API_ORDER_ID =
  /^(?:SD|SH)[0-9A-Z]{10,}$|^[0-9]{15,}$/i;

export function canFileCjDispute(order: {
  cj_order_id: string | null;
}): boolean {
  const id = order.cj_order_id?.trim();
  if (!id) return false;
  return CJ_API_ORDER_ID.test(id);
}
