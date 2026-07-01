/**
 * CJ Dropshipping API 2.0 — fulfillment only.
 *
 * Auth (confirmed current CJ docs):
 *   POST /api2.0/v1/authentication/getAccessToken
 *   Body: { "apiKey": "<CJ_API_KEY>" }
 *   Response data: accessToken, accessTokenExpiryDate, refreshToken, refreshTokenExpiryDate
 *
 * Refresh:
 *   POST /api2.0/v1/authentication/refreshAccessToken
 *   Body: { "refreshToken": "..." }
 *
 * Create order:
 *   POST /api2.0/v1/shopping/order/createOrderV2
 *   Header: CJ-Access-Token
 *
 * Auth is apiKey-only (no email/password flow). CJ_EMAIL is optional — used as
 * order email fallback when customer email is not available.
 */

import { createServiceClient } from "@/lib/supabase/admin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

/** CJ server-side token cache window — do not re-auth more than once per day. */
const CJ_SERVER_CACHE_MS = 24 * 60 * 60 * 1000;

export type CJOrderItem = {
  variantId: string;
  sku: string;
  qty: number;
};

export type CJShipping = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
};

export type CJOrderInput = {
  orderId: string;
  shipping: CJShipping;
  items: CJOrderItem[];
  /** Customer email for createOrderV2 — falls back to CJ_EMAIL env if omitted. */
  email?: string;
};

export type CJOrderResult =
  | { success: true; cjOrderId: string }
  | { success: false; error: string }
  | { skipped: true; reason: "unmapped_sku"; unmappedSkus: string[] }
  | { skipped: true; reason: "no_credentials" };

type CJTokenCache = {
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
  fetchedAt: number;
};

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
  requestId?: string;
};

type CJAccessTokenData = {
  accessToken: string;
  accessTokenExpiryDate: string;
  refreshToken: string;
  refreshTokenExpiryDate: string;
};

type CJCreateOrderData = {
  orderId?: string;
  orderNumber?: string;
};

let tokenCache: CJTokenCache | null = null;

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  france: "FR",
};

function hasApiKey(): boolean {
  return !!process.env.CJ_API_KEY?.trim();
}

function parseExpiryMs(isoDate: string): number {
  const ms = Date.parse(isoDate);
  return Number.isNaN(ms) ? 0 : ms;
}

function isAccessTokenValid(cache: CJTokenCache): boolean {
  return parseExpiryMs(cache.accessTokenExpiryDate) > Date.now();
}

function isRefreshTokenValid(cache: CJTokenCache): boolean {
  return parseExpiryMs(cache.refreshTokenExpiryDate) > Date.now();
}

function isWithinCJServerCacheWindow(cache: CJTokenCache): boolean {
  return Date.now() - cache.fetchedAt < CJ_SERVER_CACHE_MS;
}

function toCountryCode(country: string): string {
  const trimmed = country.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const mapped = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return trimmed.slice(0, 2).toUpperCase();
}

function applyTokenData(data: CJAccessTokenData): string {
  tokenCache = {
    accessToken: data.accessToken,
    accessTokenExpiryDate: data.accessTokenExpiryDate,
    refreshToken: data.refreshToken,
    refreshTokenExpiryDate: data.refreshTokenExpiryDate,
    fetchedAt: Date.now(),
  };
  return tokenCache.accessToken;
}

/**
 * Full apiKey auth — POST /authentication/getAccessToken.
 * Updates module cache with access + refresh tokens.
 */
export async function getCJToken(): Promise<string | null> {
  if (!hasApiKey()) {
    console.warn(
      "[CJ] Missing CJ_API_KEY — skipping token fetch (fulfillment disabled)."
    );
    return null;
  }

  try {
    const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
    });

    const body = (await res.json()) as CJApiEnvelope<CJAccessTokenData>;

    if (!res.ok || body.code !== 200 || !body.result || !body.data?.accessToken) {
      console.error(
        "[CJ] getAccessToken failed:",
        JSON.stringify({ status: res.status, code: body.code, message: body.message })
      );
      return null;
    }

    return applyTokenData(body.data);
  } catch (err) {
    console.error("[CJ] getAccessToken request error:", err);
    return null;
  }
}

/**
 * Refresh auth — POST /authentication/refreshAccessToken.
 * Requires a cached refreshToken from a prior getCJToken() call.
 */
export async function refreshCJToken(): Promise<string | null> {
  if (!tokenCache?.refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${CJ_API_BASE}/authentication/refreshAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokenCache.refreshToken }),
    });

    const body = (await res.json()) as CJApiEnvelope<CJAccessTokenData>;

    if (!res.ok || body.code !== 200 || !body.result || !body.data?.accessToken) {
      console.error(
        "[CJ] refreshAccessToken failed:",
        JSON.stringify({ status: res.status, code: body.code, message: body.message })
      );
      return null;
    }

    return applyTokenData(body.data);
  } catch (err) {
    console.error("[CJ] refreshAccessToken request error:", err);
    return null;
  }
}

async function resolveCJAccessToken(): Promise<string | null> {
  if (!hasApiKey()) {
    return null;
  }

  if (tokenCache) {
    if (isWithinCJServerCacheWindow(tokenCache) && isAccessTokenValid(tokenCache)) {
      return tokenCache.accessToken;
    }

    if (isRefreshTokenValid(tokenCache)) {
      const refreshed = await refreshCJToken();
      if (refreshed) return refreshed;
    }
  }

  return getCJToken();
}

/** Shared CJ API auth — respects 24h cache + refresh token flow. */
export async function getCJAccessToken(): Promise<string | null> {
  return resolveCJAccessToken();
}

type VariantCJMapping = {
  id: string;
  sku: string;
  cj_variant_id: string | null;
  product: { cj_product_id: string | null } | null;
};

async function loadCJMappings(
  items: CJOrderItem[]
): Promise<Map<string, VariantCJMapping>> {
  const supabase = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, sku, cj_variant_id, product:products(cj_product_id)")
    .in("id", variantIds);

  if (error || !data) {
    console.error("[CJ] Failed to load variant CJ mappings:", error);
    return new Map();
  }

  return new Map(
    data.map((v) => [
      v.id,
      {
        id: v.id,
        sku: v.sku,
        cj_variant_id: v.cj_variant_id,
        product: Array.isArray(v.product) ? v.product[0] : v.product,
      },
    ])
  );
}

async function loadOrderLineItemIds(
  orderId: string
): Promise<Map<string, string>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("id, variant_id")
    .eq("order_id", orderId);

  if (error || !data) {
    console.error("[CJ] Failed to load order line items:", error);
    return new Map();
  }

  return new Map(data.map((row) => [row.variant_id, row.id]));
}

function buildCreateOrderPayload(
  order: CJOrderInput,
  mappings: Map<string, VariantCJMapping>,
  lineItemIds: Map<string, string>
) {
  const { shipping } = order;
  const countryCode = toCountryCode(shipping.country);
  const logisticName =
    process.env.CJ_LOGISTIC_NAME?.trim() || "PostNL";
  const email =
    order.email?.trim() || process.env.CJ_EMAIL?.trim() || "";

  return {
    orderNumber: order.orderId,
    shippingZip: "",
    shippingCountry: shipping.country,
    shippingCountryCode: countryCode,
    shippingProvince: "",
    shippingCity: shipping.city,
    shippingCounty: "",
    shippingPhone: shipping.phone,
    shippingCustomerName: `${shipping.firstName} ${shipping.lastName}`.trim(),
    shippingAddress: shipping.address,
    shippingAddress2: "",
    remark: "",
    email,
    logisticName,
    fromCountryCode: process.env.CJ_FROM_COUNTRY_CODE?.trim() || "CN",
    platform: "shopify",
    orderFlow: 1,
    products: order.items.map((item) => {
      const mapped = mappings.get(item.variantId)!;
      const storeLineItemId =
        lineItemIds.get(item.variantId) ?? `${order.orderId}-${item.variantId}`;
      return {
        vid: mapped.cj_variant_id,
        quantity: item.qty,
        storeLineItemId,
      };
    }),
  };
}

export async function createCJOrder(order: CJOrderInput): Promise<CJOrderResult> {
  if (!hasApiKey()) {
    console.warn(
      "[CJ] Missing CJ_API_KEY — cannot fulfill order",
      order.orderId
    );
    return { skipped: true, reason: "no_credentials" };
  }

  const mappings = await loadCJMappings(order.items);
  const unmappedSkus: string[] = [];

  for (const item of order.items) {
    const mapped = mappings.get(item.variantId);
    if (!mapped?.cj_variant_id) {
      unmappedSkus.push(item.sku);
    }
  }

  if (unmappedSkus.length > 0) {
    console.warn(
      `[CJ] Skipping fulfillment for order ${order.orderId} — no CJ mapping for SKU(s): ${unmappedSkus.join(", ")}. Needs manual fulfillment or catalog import.`
    );
    return {
      skipped: true,
      reason: "unmapped_sku",
      unmappedSkus,
    };
  }

  const token = await resolveCJAccessToken();
  if (!token) {
    return {
      success: false,
      error: "CJ authentication failed — check CJ_API_KEY env var",
    };
  }

  const lineItemIds = await loadOrderLineItemIds(order.orderId);
  const payload = buildCreateOrderPayload(order, mappings, lineItemIds);

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/order/createOrderV2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as CJApiEnvelope<CJCreateOrderData>;

    if (!res.ok || body.code !== 200 || !body.result) {
      console.error(
        "[CJ] createOrderV2 failed:",
        JSON.stringify({
          httpStatus: res.status,
          code: body.code,
          message: body.message,
          requestId: body.requestId,
          orderId: order.orderId,
        })
      );
      return {
        success: false,
        error: body.message || `CJ API error (code ${body.code})`,
      };
    }

    // createOrderV2 success response shape not specified in our docs — try known id fields.
    const cjOrderId = body.data?.orderId ?? body.data?.orderNumber;
    if (!cjOrderId) {
      console.error(
        "[CJ] createOrderV2 succeeded but response missing order id fields:",
        body
      );
      return { success: false, error: "CJ response missing order id" };
    }

    console.log(
      `[CJ] Order created: aruviah=${order.orderId} cj=${cjOrderId}`
    );
    return { success: true, cjOrderId };
  } catch (err) {
    console.error("[CJ] createOrderV2 request error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown CJ API error",
    };
  }
}
