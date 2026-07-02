import type { CJInventoryRow } from "@/lib/cj-shipping-origin";

function inventoryQty(row: CJInventoryRow): number {
  return typeof row.totalInventory === "number" ? row.totalInventory : 0;
}

/**
 * CJ inventories[].verifiedWarehouse: 1=verified, 2=unverified.
 * Uses the highest-stock inventory row, same priority as shipping origin.
 */
export function resolveVariantVerifiedWarehouse(
  inventories: CJInventoryRow[] | null | undefined
): boolean | null {
  const stocked = (inventories ?? [])
    .filter((r) => inventoryQty(r) > 0)
    .sort((a, b) => inventoryQty(b) - inventoryQty(a));

  const row = stocked[0] ?? inventories?.[0];
  if (row?.verifiedWarehouse == null) return null;
  return row.verifiedWarehouse === 1;
}

export function aggregateProductVerifiedWarehouse(
  variantFlags: Array<boolean | null>
): boolean | null {
  const known = variantFlags.filter((v): v is boolean => v !== null);
  if (known.length === 0) return null;
  if (known.every((v) => v)) return true;
  if (known.every((v) => !v)) return false;
  return null;
}

export function isMixedVerification(
  variantFlags: Array<boolean | null>
): boolean {
  const known = variantFlags.filter((v): v is boolean => v !== null);
  if (known.length <= 1) return false;
  return !known.every((v) => v === known[0]);
}
