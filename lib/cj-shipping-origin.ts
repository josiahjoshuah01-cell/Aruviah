/**
 * CJ warehouse / shipping-origin helpers.
 *
 * Confirmed API fields (CJ API v2 docs + scripts/cj-api-probe.json):
 * - product/list: shippingCountryCodes e.g. ["CN_US","US"] or ["CN","CN_US"]
 * - product/variant/queryByVid (features=enable_inventory): inventories[].countryCode, totalInventory
 * - product/stock/queryByVid: areaId, areaEn, countryCode, totalInventoryNum
 */

export type CJInventoryRow = {
  countryCode?: string;
  totalInventory?: number;
  cjInventory?: number;
  factoryInventory?: number;
  /** 1=verified warehouse, 2=unverified */
  verifiedWarehouse?: number;
};

export type CJStockRow = {
  vid?: string;
  areaId?: number | string;
  areaEn?: string;
  countryCode?: string;
  totalInventoryNum?: number;
  cjInventoryNum?: number;
  factoryInventoryNum?: number;
};

/** ISO-ish warehouse countries treated as fast (US/EU local stock). */
const FAST_SHIPPING_COUNTRIES = new Set([
  "US",
  "GB",
  "UK",
  "FR",
  "DE",
  "ES",
  "IT",
  "NL",
  "BE",
  "AU",
  "CA",
  "PL",
  "SE",
  "AT",
  "IE",
  "PT",
  "DK",
  "FI",
  "CZ",
  "RO",
  "HU",
  "GR",
  "MX",
]);

function inventoryQty(row: CJInventoryRow): number {
  return typeof row.totalInventory === "number" ? row.totalInventory : 0;
}

function stockQty(row: CJStockRow): number {
  return typeof row.totalInventoryNum === "number" ? row.totalInventoryNum : 0;
}

function normalizeCountryCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  if (upper === "UK") return "GB";
  return upper;
}

/** Map list-level shippingCountryCodes entries to a warehouse country guess. */
function fromListShippingCodes(codes: string[] | undefined | null): string | null {
  if (!codes?.length) return null;
  const normalized = codes
    .map((c) => {
      const u = c.toUpperCase();
      if (u === "US" || FAST_SHIPPING_COUNTRIES.has(u)) return u === "UK" ? "GB" : u;
      if (u === "CN_US") return null;
      if (u === "CN") return "CN";
      return /^[A-Z]{2}$/.test(u) ? u : null;
    })
    .filter((c): c is string => !!c);

  const fast = normalized.find((c) => isFastShippingCountry(c));
  if (fast) return fast;
  if (normalized.includes("CN")) return "CN";
  return normalized[0] ?? null;
}

export function isFastShippingCountry(countryCode: string | null | undefined): boolean {
  const code = normalizeCountryCode(countryCode ?? null);
  if (!code) return false;
  return FAST_SHIPPING_COUNTRIES.has(code);
}

/**
 * Resolve the primary warehouse country for one variant.
 * Prefers stocked warehouses (highest inventory), then list-level fallback.
 */
export function resolveVariantShipsFromCountry(
  inventories: CJInventoryRow[] | null | undefined,
  stockRows: CJStockRow[] | null | undefined,
  listShippingCountryCodes?: string[] | null
): string | null {
  const stockedFromStock = (stockRows ?? [])
    .filter((r) => stockQty(r) > 0)
    .sort((a, b) => stockQty(b) - stockQty(a));
  if (stockedFromStock[0]?.countryCode) {
    return normalizeCountryCode(stockedFromStock[0].countryCode);
  }

  const stockedFromInv = (inventories ?? [])
    .filter((r) => inventoryQty(r) > 0)
    .sort((a, b) => inventoryQty(b) - inventoryQty(a));
  if (stockedFromInv[0]?.countryCode) {
    return normalizeCountryCode(stockedFromInv[0].countryCode);
  }

  if (stockRows?.[0]?.countryCode) {
    return normalizeCountryCode(stockRows[0].countryCode);
  }
  if (inventories?.[0]?.countryCode) {
    return normalizeCountryCode(inventories[0].countryCode);
  }

  return fromListShippingCodes(listShippingCountryCodes);
}

export function variantIsFastShipping(shipsFromCountry: string | null): boolean {
  return isFastShippingCountry(shipsFromCountry);
}

export function aggregateProductShippingOrigin(
  variantCountries: Array<string | null>
): { ships_from_country: string | null; is_fast_shipping: boolean } {
  const unique = [
    ...new Set(variantCountries.filter((c): c is string => !!c)),
  ].sort();
  const ships_from_country =
    unique.length > 0 ? unique.join(", ") : null;
  const is_fast_shipping =
    unique.length > 0 && unique.every((c) => isFastShippingCountry(c));
  return { ships_from_country, is_fast_shipping };
}

export function formatShipsFromLabel(
  shipsFromCountry: string | null,
  variantCountries?: Array<string | null>
): string {
  const unique = variantCountries
    ? [...new Set(variantCountries.filter((c): c is string => !!c))].sort()
    : shipsFromCountry
      ? shipsFromCountry.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (unique.length === 0) return "Ships from: unknown";
  if (unique.length === 1) return `Ships from: ${unique[0]}`;
  return `Ships from: ${unique.join(", ")} — mixed`;
}

/** Customer-facing delivery estimate; prefers CJ deliveryCycle when present. */
export function formatEstimatedDelivery(
  shipsFromCountry: string | null,
  deliveryCycle?: string | null
): string | null {
  const cycle = deliveryCycle?.trim();
  if (cycle) {
    const normalized = cycle.includes("day") ? cycle : `${cycle} days`;
    return `Estimated delivery: ${normalized}`;
  }
  if (!shipsFromCountry) return null;
  if (isFastShippingCountry(shipsFromCountry)) {
    return "Estimated delivery: 3-6 days";
  }
  if (shipsFromCountry.toUpperCase() === "CN") {
    return "Estimated delivery: 12-20 days";
  }
  return null;
}
