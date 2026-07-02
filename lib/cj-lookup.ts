import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCjProductReviewSummary } from "@/lib/cj-product-comments";
import {
  buildFetchedCjProduct,
  buildStagedRow,
  getCjAccessToken,
  persistStagedProduct,
  queryCjProductDetail,
  type CjQueryParam,
  type FetchedCjProduct,
  type StagedProductInsert,
} from "@/lib/cj-staging";
import { createServiceClient } from "@/lib/supabase/admin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

const UUID_PID =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const NUMERIC_PID = /^\d{10,22}$/;
/** CJ product / variant SKU codes shown on product pages (e.g. CJLJ171263533GT). */
const CJ_SKU = /^[A-Z]{2,5}[A-Z0-9][A-Z0-9-]*$/i;

export type CjIdentifierKind = "pid" | "productSku";

export type ClassifiedCjIdentifier = {
  kind: CjIdentifierKind;
  value: string;
};

/**
 * CJ /product/query accepts pid, productSku, or variantSku (one required).
 * We classify user input as pid vs SKU-style code before choosing the param.
 */
export function classifyCjIdentifier(
  raw: string
): ClassifiedCjIdentifier | null {
  const value = raw.trim();
  if (!value) return null;

  if (UUID_PID.test(value) || NUMERIC_PID.test(value)) {
    return { kind: "pid", value };
  }

  if (CJ_SKU.test(value)) {
    return { kind: "productSku", value: value.toUpperCase() };
  }

  return null;
}

export type CjLookupMethod =
  | "direct_pid"
  | "direct_productSku"
  | "direct_variantSku"
  | "list_productSku_fallback";

export type CjLookupFetchResult = {
  product: FetchedCjProduct;
  method: CjLookupMethod;
};

type CJListItem = {
  pid: string;
  productSku?: string;
  productImage?: string;
  shippingCountryCodes?: string[];
};

type CJApiEnvelope<T> = {
  code: number;
  data?: T;
};

async function fetchFromListBySku(
  headers: Record<string, string>,
  sku: string
): Promise<{ pid: string; productImage?: string; shippingCountryCodes?: string[] } | null> {
  const listUrl = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=10&productSku=${encodeURIComponent(sku)}&countryCode=US`;
  const listRes = await fetch(listUrl, { headers });
  const listBody = (await listRes.json()) as CJApiEnvelope<{ list: CJListItem[] }>;
  if (listBody.code !== 200 || !listBody.data?.list?.length) {
    return null;
  }

  const exact =
    listBody.data.list.find(
      (item) => item.productSku?.toUpperCase() === sku.toUpperCase()
    ) ?? listBody.data.list[0];

  if (!exact?.pid) return null;
  return {
    pid: exact.pid,
    productImage: exact.productImage,
    shippingCountryCodes: exact.shippingCountryCodes,
  };
}

async function fetchByQueryParam(
  headers: Record<string, string>,
  param: CjQueryParam,
  value: string,
  listShippingCountryCodes: string[] | null,
  fallbackListImage?: string | null
): Promise<FetchedCjProduct | null> {
  const detail = await queryCjProductDetail(headers, param, value);
  if (!detail) return null;
  return buildFetchedCjProduct(
    headers,
    detail,
    listShippingCountryCodes,
    fallbackListImage
  );
}

/**
 * Resolve a CJ pid or SKU to a fully enriched product ready for staging.
 */
export async function fetchCjProductForLookup(
  identifier: string,
  headers: Record<string, string>
): Promise<CjLookupFetchResult | null> {
  const classified = classifyCjIdentifier(identifier);
  if (!classified) return null;

  if (classified.kind === "pid") {
    const product = await fetchByQueryParam(
      headers,
      "pid",
      classified.value,
      null
    );
    if (!product) return null;
    return { product, method: "direct_pid" };
  }

  const sku = classified.value;

  let product = await fetchByQueryParam(headers, "productSku", sku, null);
  if (product) {
    return { product, method: "direct_productSku" };
  }

  product = await fetchByQueryParam(headers, "variantSku", sku, null);
  if (product) {
    return { product, method: "direct_variantSku" };
  }

  const listHit = await fetchFromListBySku(headers, sku);
  if (!listHit) return null;

  product = await fetchByQueryParam(
    headers,
    "pid",
    listHit.pid,
    listHit.shippingCountryCodes ?? null,
    listHit.productImage
  );
  if (!product) return null;

  return { product, method: "list_productSku_fallback" };
}

export type CjLookupSuccess = {
  ok: true;
  row: StagedProductInsert;
  lookupMethod: CjLookupMethod;
};

export type CjLookupFailure = {
  ok: false;
  error: string;
};

export type CjLookupResult = CjLookupSuccess | CjLookupFailure;

export type RunCjLookupOptions = {
  supabase?: SupabaseClient;
  cjApiKey?: string;
};

export async function stageCjLookup(
  supabase: SupabaseClient,
  identifier: string,
  categorySlug: string,
  cjApiKey: string
): Promise<{ row: StagedProductInsert; lookupMethod: CjLookupMethod }> {
  const trimmedId = identifier.trim();
  if (!trimmedId) {
    throw new Error("Product ID or SKU is required.");
  }

  if (!classifyCjIdentifier(trimmedId)) {
    throw new Error(
      "Enter a CJ product ID (UUID or numeric) or a product SKU like CJLJ171263533GT."
    );
  }

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

  const fetched = await fetchCjProductForLookup(trimmedId, headers);
  if (!fetched) {
    throw new Error("No CJ product found for that ID.");
  }

  const row = buildStagedRow(
    fetched.product.detail,
    fetched.product.variants,
    fetched.product.coverImage,
    category.id,
    `id:${trimmedId}`,
    fetched.product.listShippingCountryCodes,
    await fetchCjProductReviewSummary(headers, fetched.product.detail.pid)
  );

  await persistStagedProduct(supabase, row);
  return { row, lookupMethod: fetched.method };
}

export async function runCjLookup(
  identifier: string,
  categorySlug: string,
  options: RunCjLookupOptions = {}
): Promise<CjLookupResult> {
  const trimmedId = identifier.trim();
  const trimmedSlug = categorySlug.trim();

  if (!trimmedId) {
    return { ok: false, error: "Product ID or SKU is required." };
  }
  if (!trimmedSlug) {
    return { ok: false, error: "Category is required." };
  }

  const cjApiKey = options.cjApiKey ?? process.env.CJ_API_KEY?.trim();
  if (!cjApiKey) {
    return { ok: false, error: "CJ_API_KEY is not configured." };
  }

  try {
    const supabase = options.supabase ?? createServiceClient();
    const { row, lookupMethod } = await stageCjLookup(
      supabase,
      trimmedId,
      trimmedSlug,
      cjApiKey
    );
    return { ok: true, row, lookupMethod };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "CJ lookup failed unexpectedly.";
    return { ok: false, error: message };
  }
}
