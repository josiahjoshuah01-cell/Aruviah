import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanTitle,
  parseColorSize,
  parsePrice,
  type CJVariantLike,
} from "@/lib/cj-variant-parse";
import {
  aggregateProductShippingOrigin,
  type CJInventoryRow,
  type CJStockRow,
  resolveVariantShipsFromCountry,
  variantIsFastShipping,
} from "@/lib/cj-shipping-origin";
import { fetchCjProductReviewSummary } from "@/lib/cj-product-comments";
import type { CjReviewSummary } from "@/lib/cj-product-comments";
import { sanitizeCjDescription } from "@/lib/cj-description";
import {
  aggregateProductVerifiedWarehouse,
  resolveVariantVerifiedWarehouse,
} from "@/lib/cj-verified-warehouse";
import type { StagedVariantJson } from "@/lib/staging-types";
const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
/** CJ documents 1 req/s on many GET endpoints — shared across query/list calls. */
const CJ_QUERY_MIN_INTERVAL_MS = 1100;

let lastCjQueryAt = 0;

async function waitForCjQuerySlot(): Promise<void> {
  const now = Date.now();
  const wait = CJ_QUERY_MIN_INTERVAL_MS - (now - lastCjQueryAt);
  if (wait > 0) await sleep(wait);
  lastCjQueryAt = Date.now();
}
export const CJ_MARKUP_MULTIPLIER = 2;
const DEFAULT_STOCK = 50;

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

type CJListItem = {
  pid: string;
  productNameEn: string;
  productImage: string;
  sellPrice: string | number;
  categoryName?: string;
  saleStatus?: number;
  shippingCountryCodes?: string[];
};

type CJVariant = CJVariantLike & {
  vid: string;
  pid: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  freight?: number | string;
  inventories?: CJInventoryRow[];
  _stockRows?: CJStockRow[];
};
type CJProductDetail = {
  pid: string;
  productNameEn: string;
  bigImage?: string;
  productImageSet?: string[];
  sellPrice?: number | string;
  description?: string;
  categoryName?: string;
  variants?: CJVariant[];
};

const SLUG_TERMS: Record<string, string[]> = {
  electronics: [
    "electronic",
    "earphone",
    "headphone",
    "bluetooth",
    "usb",
    "phone",
    "power",
    "smart",
    "watch",
    "speaker",
    "charger",
    "cable",
  ],
  home: [
    "home",
    "blanket",
    "pillow",
    "storage",
    "basket",
    "clock",
    "decor",
    "furniture",
    "organizer",
    "lamp",
    "pet",
    "bed",
  ],
  kitchen: ["kitchen", "mug", "knife", "cutting", "cook", "pot", "pan", "dining"],
  fashion: [
    "fashion",
    "shirt",
    "hoodie",
    "bag",
    "dress",
    "clothing",
    "women",
    "men",
    "wallet",
    "sunglass",
    "shoe",
  ],
  beauty: ["beauty", "makeup", "skin", "lip", "serum", "brush", "cosmetic"],
  toys: ["toy", "kids", "puzzle", "plush", "game", "blocks"],
  sports: ["sport", "fitness", "yoga", "gym", "outdoor", "resistance"],
  garden: ["garden", "plant", "lawn", "watering", "pot"],
};

/** Fallback for DB categories not listed in SLUG_TERMS (e.g. wedding-hair-jewelry). */
function termsForCategorySlug(slug: string): string[] {
  const mapped = SLUG_TERMS[slug];
  if (mapped) return mapped;
  return slug
    .split(/[-_]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
}

function matchesCategorySlug(
  slug: string,
  productName: string,
  cjCategory?: string
): boolean {
  const terms = termsForCategorySlug(slug);
  if (terms.length === 0) return true;
  const haystack = `${productName} ${cjCategory ?? ""}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function variantStock(v: CJVariant): number {
  const inv = v.inventories?.[0]?.totalInventory;
  if (typeof inv === "number" && inv > 0) return inv;
  return DEFAULT_STOCK;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getCjAccessToken(apiKey: string): Promise<string> {
  const authRes = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const authBody = (await authRes.json()) as CJApiEnvelope<{ accessToken: string }>;
  if (authBody.code !== 200 || !authBody.data?.accessToken) {
    throw new Error(`CJ auth failed: ${authBody.message}`);
  }
  return authBody.data.accessToken;
}

export type StagedProductInsert = {
  cj_product_id: string;
  title: string;
  description: string;
  cost_price_usd: number;
  suggested_price_usd: number;
  image_url: string | null;
  suggested_category_id: string;
  variants: StagedVariantJson[];
  search_keyword: string;
  ships_from_country: string | null;
  is_fast_shipping: boolean;
  is_verified_warehouse: boolean | null;
  cj_review_count: number | null;
  cj_review_avg_score: number | null;
};

type FetchedCjProduct = {
  detail: CJProductDetail;
  variants: CJVariant[];
  coverImage: string | null;
  listShippingCountryCodes: string[] | null;
};

export type { FetchedCjProduct };

export type CjQueryParam = "pid" | "productSku" | "variantSku";

export async function queryCjProductDetail(
  headers: Record<string, string>,
  param: CjQueryParam,
  value: string
): Promise<CJProductDetail | null> {
  const countryFilters: Array<string | null> = ["US", null];

  for (const countryCode of countryFilters) {
    const queryUrl =
      countryCode != null
        ? `${CJ_API_BASE}/product/query?${param}=${encodeURIComponent(value)}&countryCode=${countryCode}`
        : `${CJ_API_BASE}/product/query?${param}=${encodeURIComponent(value)}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      await waitForCjQuerySlot();
      const queryRes = await fetch(queryUrl, { headers });
      const queryBody = (await queryRes.json()) as CJApiEnvelope<CJProductDetail> & {
        code?: number;
      };

      const rateLimited =
        queryRes.status === 429 || queryBody.code === 1600200;
      if (rateLimited && attempt < 2) {
        await sleep(CJ_QUERY_MIN_INTERVAL_MS);
        continue;
      }

      if (queryBody.code !== 200 || !queryBody.data?.pid) {
        break;
      }

      const detail = queryBody.data;
      const hasVariants = (detail.variants?.length ?? 0) > 0;
      if (hasVariants || countryCode === null) {
        return detail;
      }
      // US filter can return pid with zero variants when stock is CN-only — retry unfiltered.
      break;
    }
  }

  return null;
}

export async function fetchCjVariantsByPid(
  headers: Record<string, string>,
  pid: string
): Promise<CJVariant[]> {
  const countryFilters: Array<string | null> = ["US", null];

  for (const countryCode of countryFilters) {
    const url =
      countryCode != null
        ? `${CJ_API_BASE}/product/variant/query?pid=${encodeURIComponent(pid)}&countryCode=${countryCode}`
        : `${CJ_API_BASE}/product/variant/query?pid=${encodeURIComponent(pid)}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      await waitForCjQuerySlot();
      const res = await fetch(url, { headers });
      const body = (await res.json()) as CJApiEnvelope<CJVariant[]> & {
        code?: number;
      };

      const rateLimited = res.status === 429 || body.code === 1600200;
      if (rateLimited && attempt < 2) {
        await sleep(CJ_QUERY_MIN_INTERVAL_MS);
        continue;
      }

      if (body.code !== 200 || !Array.isArray(body.data)) {
        break;
      }
      if (body.data.length > 0 || countryCode === null) {
        return body.data;
      }
      break;
    }
  }

  return [];
}

export async function enrichCjVariants(
  headers: Record<string, string>,
  detail: CJProductDetail,
  seedVariants: CJVariant[]
): Promise<CJVariant[]> {
  const enrichedVariants: CJVariant[] = [];
  for (const v of seedVariants.slice(0, 24)) {
    if (!v.vid) continue;
    await waitForCjQuerySlot();
    const vidUrl = `${CJ_API_BASE}/product/variant/queryByVid?vid=${encodeURIComponent(v.vid)}&features=enable_inventory`;
    const vidBody = (await fetch(vidUrl, { headers }).then((r) =>
      r.json()
    )) as CJApiEnvelope<CJVariant>;
    let merged: CJVariant = v;
    if (vidBody.code === 200 && vidBody.data) {
      merged = { ...v, ...vidBody.data };
    }

    await waitForCjQuerySlot();
    const stockUrl = `${CJ_API_BASE}/product/stock/queryByVid?vid=${encodeURIComponent(v.vid)}`;
    const stockBody = (await fetch(stockUrl, { headers }).then((r) =>
      r.json()
    )) as CJApiEnvelope<CJStockRow[] | CJStockRow>;
    const stockRows = Array.isArray(stockBody.data)
      ? stockBody.data
      : stockBody.data
        ? [stockBody.data]
        : [];
    enrichedVariants.push({ ...merged, _stockRows: stockRows });
  }
  return enrichedVariants;
}

export async function buildFetchedCjProduct(
  headers: Record<string, string>,
  detail: CJProductDetail,
  listShippingCountryCodes: string[] | null,
  fallbackListImage?: string | null
): Promise<FetchedCjProduct | null> {
  let seedVariants = detail.variants ?? [];
  if (!seedVariants.length && detail.pid) {
    seedVariants = await fetchCjVariantsByPid(headers, detail.pid);
  }
  if (!seedVariants.length) return null;

  const enrichedVariants = await enrichCjVariants(headers, detail, seedVariants);
  const withPrice = enrichedVariants.filter(
    (v) =>
      parsePrice(v.variantSellPrice) > 0 || parsePrice(detail.sellPrice) > 0
  );
  if (withPrice.length === 0) return null;

  const coverImage =
    detail.bigImage ||
    detail.productImageSet?.[0] ||
    withPrice[0]?.variantImage ||
    fallbackListImage ||
    null;

  return {
    detail,
    variants: withPrice,
    coverImage,
    listShippingCountryCodes,
  };
}

export async function persistStagedProduct(
  supabase: SupabaseClient,
  row: StagedProductInsert
): Promise<StagedProductInsert> {
  const missingOrigin = row.variants.filter((v) => !v.ships_from_country?.trim());
  if (missingOrigin.length > 0) {
    throw new Error(
      `Cannot stage product ${row.cj_product_id}: ${missingOrigin.length} variant(s) missing ships_from_country after CJ stock lookup`
    );
  }

  const { data: live } = await supabase
    .from("products")
    .select("id")
    .eq("cj_product_id", row.cj_product_id)
    .maybeSingle();

  if (live) {
    throw new Error(
      `Product already live (cj_product_id ${row.cj_product_id})`
    );
  }

  const { data: pending } = await supabase
    .from("staged_products")
    .select("id")
    .eq("cj_product_id", row.cj_product_id)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) {
    throw new Error(
      `Product already staged as pending (cj_product_id ${row.cj_product_id})`
    );
  }

  const { error } = await supabase.from("staged_products").insert({
    ...row,
    status: "pending",
  });

  if (error) {
    throw new Error(`Failed to insert staged product: ${error.message}`);
  }

  return row;
}

export async function fetchCjProductForStaging(
  keyword: string,
  categorySlug: string,
  headers: Record<string, string>
): Promise<FetchedCjProduct | null> {  const listUrl = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=10&productNameEn=${encodeURIComponent(keyword)}&countryCode=US`;
  const listRes = await fetch(listUrl, { headers });
  const listBody = (await listRes.json()) as CJApiEnvelope<{ list: CJListItem[] }>;

  if (listBody.code !== 200 || !listBody.data?.list?.length) {
    return null;
  }

  const candidate =
    listBody.data.list.find(
      (p) =>
        p.pid &&
        p.productImage &&
        matchesCategorySlug(categorySlug, p.productNameEn, p.categoryName)
    ) ?? listBody.data.list.find((p) => p.pid && p.productImage);

  if (!candidate?.pid) return null;

  await sleep(300);
  const queryUrl = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(candidate.pid)}&countryCode=US`;
  const queryRes = await fetch(queryUrl, { headers });
  const queryBody = (await queryRes.json()) as CJApiEnvelope<CJProductDetail>;

  const detail = queryBody.data;
  if (queryBody.code !== 200 || !detail?.variants?.length) {
    return null;
  }

  const cjCategoryName = detail.categoryName ?? candidate.categoryName ?? "";
  if (
    !matchesCategorySlug(categorySlug, detail.productNameEn, cjCategoryName)
  ) {
    return null;
  }

  return buildFetchedCjProduct(
    headers,
    detail,
    candidate.shippingCountryCodes ?? null,
    candidate.productImage
  );
}

export function buildStagedRow(
  detail: CJProductDetail,
  variants: CJVariant[],
  coverImage: string | null,
  categoryId: string,
  keyword: string,
  listShippingCountryCodes?: string[] | null,
  reviewSummary?: CjReviewSummary | null
): StagedProductInsert {
  const stagedVariants: StagedVariantJson[] = variants.map((v) => {
    const cost =
      parsePrice(v.variantSellPrice) || parsePrice(detail.sellPrice);
    const { color, size } = parseColorSize(v);
    const shipsFrom = resolveVariantShipsFromCountry(
      v.inventories,
      v._stockRows,
      listShippingCountryCodes
    );
    const isVerifiedWarehouse = resolveVariantVerifiedWarehouse(v.inventories);
    return {
      cj_variant_id: v.vid,
      color,
      size,
      cost_price_usd: Math.round(cost * 100) / 100,
      price_usd: Math.round(cost * CJ_MARKUP_MULTIPLIER * 100) / 100,
      shipping_cost_usd: Math.round(parsePrice(v.freight) * 100) / 100,
      stock: variantStock(v),
      image_url: v.variantImage || coverImage,
      ships_from_country: shipsFrom,
      is_fast_shipping: variantIsFastShipping(shipsFrom),
      is_verified_warehouse: isVerifiedWarehouse,
    };
  });

  const productShipping = aggregateProductShippingOrigin(
    stagedVariants.map((v) => v.ships_from_country)
  );

  const productVerified = aggregateProductVerifiedWarehouse(
    stagedVariants.map((v) => v.is_verified_warehouse ?? null)
  );

  const costs = stagedVariants.map((v) => v.cost_price_usd).filter((c) => c > 0);
  const minCost = costs.length > 0 ? Math.min(...costs) : 0;
  const minRetail =
    stagedVariants.length > 0
      ? Math.min(...stagedVariants.map((v) => v.price_usd))
      : Math.round(minCost * CJ_MARKUP_MULTIPLIER * 100) / 100;

  const description = sanitizeCjDescription(
    detail.description,
    cleanTitle(detail.productNameEn),
    detail.categoryName ?? undefined
  );

  return {
    cj_product_id: detail.pid,
    title: cleanTitle(detail.productNameEn),
    description,
    cost_price_usd: minCost,
    suggested_price_usd: minRetail,
    image_url: coverImage,
    suggested_category_id: categoryId,
    variants: stagedVariants,
    search_keyword: keyword,
    ships_from_country: productShipping.ships_from_country,
    is_fast_shipping: productShipping.is_fast_shipping,
    is_verified_warehouse: productVerified,
    cj_review_count: reviewSummary?.count ?? null,
    cj_review_avg_score: reviewSummary?.avgScore ?? null,
  };
}
export async function stageCjSearch(
  supabase: SupabaseClient,
  keyword: string,
  categorySlug: string,
  cjApiKey: string
): Promise<StagedProductInsert> {
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (!category?.id) {
    throw new Error(`Unknown category slug: ${categorySlug}`);
  }

  const token = await getCjAccessToken(cjApiKey);
  const headers = {
    "CJ-Access-Token": token,
    "Content-Type": "application/json",
  };

  const fetched = await fetchCjProductForStaging(keyword, categorySlug, headers);
  if (!fetched) {
    throw new Error(
      `No CJ product found for keyword "${keyword}" in category "${categorySlug}"`
    );
  }

  const row = buildStagedRow(
    fetched.detail,
    fetched.variants,
    fetched.coverImage,
    category.id,
    keyword,
    fetched.listShippingCountryCodes,
    await fetchCjProductReviewSummary(headers, fetched.detail.pid)
  );

  return persistStagedProduct(supabase, row);
}
