import { createServiceClient } from "@/lib/supabase/admin";
import {
  getValidLogisticsOptions,
  toCountryCode,
  warehouseFromCountryCode,
  type CjFreightOption,
  type CjFreightProduct,
} from "@/lib/cj";
import type { CartItemInput } from "@/lib/validations";

/** Block capture when live freight drifts more than this from the PayPal order amount. */
export const SHIPPING_DRIFT_BLOCK_THRESHOLD_USD = 2;

export type ShippingOriginBreakdown = {
  fromCountryCode: string;
  destinationCountryCode: string;
  shippingUsd: number;
  logisticName: string;
  itemCount: number;
  variantIds: string[];
};

export type UnshippableItem = {
  variantId: string;
  title: string;
  sku: string;
  fromCountryCode: string;
  destinationCountry: string;
};

export type CheckoutShippingQuote = {
  subtotal: number;
  shippingTotal: number;
  total: number;
  destinationCountryCode: string;
  groups: ShippingOriginBreakdown[];
};

type VariantRow = {
  id: string;
  price_usd: number;
  cj_variant_id: string | null;
  ships_from_country: string | null;
  sku: string;
  is_active: boolean;
  product:
    | { title: string; is_active: boolean }
    | { title: string; is_active: boolean }[];
};

type GroupItem = {
  variantId: string;
  title: string;
  sku: string;
  qty: number;
  cjVid: string;
};

export function freightOptionCostUsd(option: CjFreightOption): number {
  if (option.totalPostageFee != null && option.totalPostageFee > 0) {
    return option.totalPostageFee;
  }
  return option.logisticPrice;
}

export function selectCheapestFreightOption(
  options: CjFreightOption[]
): CjFreightOption | null {
  if (options.length === 0) return null;
  return options.reduce((best, opt) =>
    freightOptionCostUsd(opt) < freightOptionCostUsd(best) ? opt : best
  );
}

/**
 * Live CJ freightCalculate grouped by warehouse origin.
 * Mixed-origin carts sum per-group shipping (customer pricing only — CJ
 * createOrderV2 may still require manual review for mixed warehouses).
 */
export async function calculateCheckoutShipping(
  items: CartItemInput[],
  destinationCountry: string
): Promise<
  | { ok: true; quote: CheckoutShippingQuote }
  | { ok: false; error: string; unshippableItems?: UnshippableItem[] }
> {
  const supabase = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data: variants, error } = await supabase
    .from("product_variants")
    .select(
      "id, price_usd, cj_variant_id, ships_from_country, sku, is_active, product:products(title, is_active)"
    )
    .in("id", variantIds);

  if (error || !variants) {
    return { ok: false, error: "Failed to fetch product variants" };
  }

  const variantMap = new Map(variants.map((v) => [v.id, v as VariantRow]));
  const endCountryCode = toCountryCode(destinationCountry);
  const groups = new Map<string, GroupItem[]>();
  let subtotal = 0;

  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    const product = Array.isArray(variant?.product)
      ? variant.product[0]
      : variant?.product;

    if (!variant || !variant.is_active || !product?.is_active) {
      return { ok: false, error: `Variant ${item.variantId} is unavailable` };
    }

    subtotal += Number(variant.price_usd) * item.qty;

    if (!variant.cj_variant_id) {
      return {
        ok: false,
        error: `"${product.title}" cannot be shipped — missing CJ mapping`,
      };
    }

    const fromCode = warehouseFromCountryCode(variant.ships_from_country);
    const groupItems = groups.get(fromCode) ?? [];
    groupItems.push({
      variantId: variant.id,
      title: product.title,
      sku: variant.sku,
      qty: item.qty,
      cjVid: variant.cj_variant_id,
    });
    groups.set(fromCode, groupItems);
  }

  const breakdown: ShippingOriginBreakdown[] = [];
  const unshippableItems: UnshippableItem[] = [];
  let shippingTotal = 0;

  for (const [fromCountryCode, groupItems] of groups) {
    const freightProducts: CjFreightProduct[] = groupItems.map((g) => ({
      vid: g.cjVid,
      quantity: g.qty,
    }));

    const options = await getValidLogisticsOptions(
      freightProducts,
      fromCountryCode,
      endCountryCode
    );

    const chosen = selectCheapestFreightOption(options);
    if (!chosen) {
      for (const g of groupItems) {
        unshippableItems.push({
          variantId: g.variantId,
          title: g.title,
          sku: g.sku,
          fromCountryCode,
          destinationCountry: endCountryCode,
        });
      }
      continue;
    }

    const groupShipping = freightOptionCostUsd(chosen);
    shippingTotal += groupShipping;

    breakdown.push({
      fromCountryCode,
      destinationCountryCode: endCountryCode,
      shippingUsd: groupShipping,
      logisticName: chosen.logisticName,
      itemCount: groupItems.reduce((sum, g) => sum + g.qty, 0),
      variantIds: groupItems.map((g) => g.variantId),
    });
  }

  if (unshippableItems.length > 0) {
    return {
      ok: false,
      error: `Some items cannot ship to ${endCountryCode}`,
      unshippableItems,
    };
  }

  return {
    ok: true,
    quote: {
      subtotal,
      shippingTotal,
      total: subtotal + shippingTotal,
      destinationCountryCode: endCountryCode,
      groups: breakdown,
    },
  };
}
