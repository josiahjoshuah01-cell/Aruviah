import { type CJStockRow } from "@/lib/cj-shipping-origin";
import { getCJAccessToken } from "@/lib/cj";
import { createServiceClient } from "@/lib/supabase/admin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const CJ_STOCK_QUERY_INTERVAL_MS = 1100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

export type CjStockRefreshInput = {
  id: string;
  cj_variant_id: string;
  sku?: string;
};

export type CjStockRefreshResult = {
  variantId: string;
  sku: string;
  before: number;
  after: number;
  cjStock: number;
  updated: boolean;
  error?: string;
};

export function totalCjStockFromRows(rows: CJStockRow[]): number {
  return rows.reduce((sum, row) => {
    const qty =
      typeof row.totalInventoryNum === "number" ? row.totalInventoryNum : 0;
    return sum + Math.max(0, qty);
  }, 0);
}

export async function queryCjStockByVid(vid: string): Promise<number | null> {
  const token = await getCJAccessToken();
  if (!token) return null;

  const url = `${CJ_API_BASE}/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`;
  const res = await fetch(url, {
    headers: { "CJ-Access-Token": token },
  });
  const body = (await res.json()) as CJApiEnvelope<CJStockRow[] | CJStockRow>;

  if (!res.ok || body.code !== 200) {
    console.error(
      "[CJ stock] queryByVid failed:",
      JSON.stringify({ vid, code: body.code, message: body.message })
    );
    return null;
  }

  const rows = Array.isArray(body.data)
    ? body.data
    : body.data
      ? [body.data]
      : [];
  return totalCjStockFromRows(rows);
}

/**
 * Pull live CJ inventory for mapped variants and sync local product_variants.stock.
 */
export async function refreshLiveCjStock(
  variants: CjStockRefreshInput[]
): Promise<CjStockRefreshResult[]> {
  if (variants.length === 0) return [];

  const supabase = createServiceClient();
  const variantIds = variants.map((v) => v.id);
  const { data: localRows, error } = await supabase
    .from("product_variants")
    .select("id, sku, stock")
    .in("id", variantIds);

  if (error) throw error;

  const localById = new Map(
    (localRows ?? []).map((row) => [
      row.id,
      { sku: row.sku as string, stock: Number(row.stock) },
    ])
  );

  const results: CjStockRefreshResult[] = [];

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (i > 0) await sleep(CJ_STOCK_QUERY_INTERVAL_MS);
    const local = localById.get(variant.id);
    const sku = variant.sku ?? local?.sku ?? variant.id.slice(0, 8);
    const before = local?.stock ?? 0;

    if (!variant.cj_variant_id?.trim()) {
      results.push({
        variantId: variant.id,
        sku,
        before,
        after: before,
        cjStock: before,
        updated: false,
        error: "No CJ variant mapping",
      });
      continue;
    }

    const cjStock = await queryCjStockByVid(variant.cj_variant_id);
    if (cjStock == null) {
      results.push({
        variantId: variant.id,
        sku,
        before,
        after: before,
        cjStock: before,
        updated: false,
        error: "CJ stock query failed",
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from("product_variants")
      .update({ stock: cjStock })
      .eq("id", variant.id);

    if (updateError) {
      results.push({
        variantId: variant.id,
        sku,
        before,
        after: before,
        cjStock,
        updated: false,
        error: updateError.message,
      });
      continue;
    }

    results.push({
      variantId: variant.id,
      sku,
      before,
      after: cjStock,
      cjStock,
      updated: before !== cjStock,
    });
  }

  return results;
}

export type CheckoutStockItem = {
  variantId: string;
  qty: number;
  title: string;
};

/**
 * Real-time CJ stock check for cart items — blocks checkout when CJ says insufficient.
 * Variants without cj_variant_id are skipped (local stock already validated).
 */
export async function verifyCjLiveStockAtCheckout(
  items: CheckoutStockItem[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (items.length === 0) return { ok: true };

  const supabase = createServiceClient();
  const variantIds = items.map((i) => i.variantId);
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, cj_variant_id, stock")
    .in("id", variantIds);

  if (error || !variants) {
    return { ok: false, error: "Failed to verify inventory" };
  }

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) await sleep(CJ_STOCK_QUERY_INTERVAL_MS);
    const variant = variantMap.get(item.variantId);
    const cjVid = variant?.cj_variant_id?.trim();
    if (!cjVid) continue;

    const liveStock = await queryCjStockByVid(cjVid);
    if (liveStock == null) {
      console.warn(
        `[checkout] CJ stock query failed for variant ${item.variantId} — allowing order`
      );
      continue;
    }

    if (liveStock < item.qty) {
      const localStock = variant?.stock ?? 0;
      if (liveStock !== localStock) {
        await supabase
          .from("product_variants")
          .update({ stock: liveStock })
          .eq("id", item.variantId);
      }
      return {
        ok: false,
        error: `"${item.title}" just went out of stock — only ${liveStock} available`,
      };
    }
  }

  return { ok: true };
}
