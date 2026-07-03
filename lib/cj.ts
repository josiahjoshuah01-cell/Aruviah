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

/** When CJ_SANDBOX_MODE=true|1, createOrderV2 sends isSandbox: 1 (default off). */
export function isCjSandboxMode(): boolean {
  const raw = process.env.CJ_SANDBOX_MODE?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Refresh the access token proactively when CJ's returned expiry is within this
 * window. Uses accessTokenExpiryDate from CJ — not a fixed day count.
 */
export const CJ_ACCESS_TOKEN_REFRESH_BEFORE_MS = 48 * 60 * 60 * 1000;

/** CJ documents a 1 req/s cap on POST /authentication/getAccessToken. */
const GET_ACCESS_TOKEN_MIN_INTERVAL_MS = 1100;

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
  zip?: string;
};

export type CJOrderInput = {
  orderId: string;
  shipping: CJShipping;
  items: CJOrderItem[];
  /** Customer email for createOrderV2 — falls back to CJ_EMAIL env if omitted. */
  email?: string;
  /** Overrides CJ_LOGISTIC_NAME env when set (e.g. from freightCalculate). */
  logisticName?: string;
  /** Overrides CJ_FROM_COUNTRY_CODE env for createOrderV2 fromCountryCode. */
  fromCountryCode?: string;
};

export type CJOrderResult =
  | {
      success: true;
      cjOrderId: string;
      shipmentOrderId: string | null;
      payId: string | null;
      orderAmountUsd: number;
    }
  | { success: false; error: string }
  | { skipped: true; reason: "unmapped_sku"; unmappedSkus: string[] }
  | { skipped: true; reason: "no_credentials" }
  | {
      intercepted: true;
      reasons: unknown[];
      cjOrderId: string | null;
    };

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
  shipmentOrderId?: string;
  payId?: string;
  orderAmount?: string | number;
  actualPayment?: string | number;
  interceptOrderReasons?: unknown;
};

function normalizeInterceptReasons(raw: unknown): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw;
}

export type CjOrderDetailData = {
  orderId?: string;
  orderNum?: string;
  cjOrderId?: string | null;
  cjOrderCode?: string | null;
  orderStatus?: string;
  trackNumber?: string | null;
  trackingProvider?: string | null;
  trackingUrl?: string | null;
};

export type CjLogisticsOption = {
  id: number;
  orderCode: string;
  logisticsName: string;
  postage?: number;
  startCountry?: string;
  arrivalTime?: string;
};

export type CjFreightOption = {
  logisticName: string;
  logisticPrice: number;
  logisticPriceCn: number | null;
  logisticAging: string | null;
  taxesFee: number | null;
  clearanceOperationFee: number | null;
  totalPostageFee: number | null;
};

export type CjTrackInfoData = {
  trackingNumber?: string;
  logisticName?: string;
  trackingFrom?: string;
  trackingTo?: string;
  deliveryDay?: string;
  deliveryTime?: string;
  trackingStatus?: string;
  lastMileCarrier?: string;
  lastTrackNumber?: string;
};

let tokenCache: CJTokenCache | null = null;
let resolveInFlight: Promise<string | null> | null = null;
let lastGetAccessTokenAt = 0;
let lastFreightCalculateAt = 0;

const FREIGHT_CALCULATE_MIN_INTERVAL_MS = 1100;

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

export function parseCjTokenExpiryMs(isoDate: string): number {
  const ms = Date.parse(isoDate);
  return Number.isNaN(ms) ? 0 : ms;
}

function isAccessTokenValid(
  cache: CJTokenCache,
  nowMs = Date.now()
): boolean {
  return parseCjTokenExpiryMs(cache.accessTokenExpiryDate) > nowMs;
}

function isRefreshTokenValid(
  cache: CJTokenCache,
  nowMs = Date.now()
): boolean {
  return parseCjTokenExpiryMs(cache.refreshTokenExpiryDate) > nowMs;
}

function msUntilAccessTokenExpiry(
  cache: CJTokenCache,
  nowMs = Date.now()
): number {
  return parseCjTokenExpiryMs(cache.accessTokenExpiryDate) - nowMs;
}

/** True when the cached access token is still usable without refreshing. */
export function shouldUseCachedAccessToken(
  cache: CJTokenCache,
  nowMs = Date.now(),
  refreshBeforeMs = CJ_ACCESS_TOKEN_REFRESH_BEFORE_MS
): boolean {
  const remaining = msUntilAccessTokenExpiry(cache, nowMs);
  return remaining > refreshBeforeMs;
}

/** True when we should call refreshAccessToken before the access token lapses. */
export function shouldRefreshAccessToken(
  cache: CJTokenCache,
  nowMs = Date.now(),
  refreshBeforeMs = CJ_ACCESS_TOKEN_REFRESH_BEFORE_MS
): boolean {
  if (!isRefreshTokenValid(cache, nowMs)) return false;
  const remaining = msUntilAccessTokenExpiry(cache, nowMs);
  return remaining <= refreshBeforeMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toCountryCode(country: string): string {
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

  const now = Date.now();
  const waitMs = GET_ACCESS_TOKEN_MIN_INTERVAL_MS - (now - lastGetAccessTokenAt);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastGetAccessTokenAt = Date.now();

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

async function resolveCJAccessTokenImpl(): Promise<string | null> {
  if (!hasApiKey()) {
    return null;
  }

  if (tokenCache) {
    if (shouldUseCachedAccessToken(tokenCache)) {
      return tokenCache.accessToken;
    }

    if (shouldRefreshAccessToken(tokenCache) || !isAccessTokenValid(tokenCache)) {
      if (isRefreshTokenValid(tokenCache)) {
        const refreshed = await refreshCJToken();
        if (refreshed) return refreshed;
        if (isAccessTokenValid(tokenCache)) {
          console.warn(
            "[CJ] refreshAccessToken failed — reusing access token until expiry"
          );
          return tokenCache.accessToken;
        }
      }
    }
  }

  return getCJToken();
}

async function resolveCJAccessToken(): Promise<string | null> {
  if (resolveInFlight) return resolveInFlight;
  resolveInFlight = resolveCJAccessTokenImpl().finally(() => {
    resolveInFlight = null;
  });
  return resolveInFlight;
}

/** Shared CJ API auth — expiry-driven cache + refresh token flow. */
export async function getCJAccessToken(): Promise<string | null> {
  return resolveCJAccessToken();
}

/** Test helpers — not for production use. */
export const __cjAuthTest = {
  getCache: () => tokenCache,
  setCache: (cache: CJTokenCache | null) => {
    tokenCache = cache;
  },
  reset: () => {
    tokenCache = null;
    resolveInFlight = null;
    lastGetAccessTokenAt = 0;
  },
  resolveCJAccessToken,
};

type VariantCJMapping = {
  id: string;
  sku: string;
  cj_variant_id: string | null;
  ships_from_country: string | null;
  product: { cj_product_id: string | null } | null;
};

export type CjFreightProduct = {
  vid: string;
  quantity: number;
};

/** CJ createOrderV2 fromCountryCode from stored variant warehouse origin. */
export function warehouseFromCountryCode(
  shipsFrom: string | null | undefined
): string {
  const code = shipsFrom?.trim().toUpperCase();
  if (!code) {
    return process.env.CJ_FROM_COUNTRY_CODE?.trim() || "CN";
  }
  if (code === "UK") return "GB";
  if (/^[A-Z]{2}$/.test(code)) return code;
  return process.env.CJ_FROM_COUNTRY_CODE?.trim() || "CN";
}

async function loadCJMappings(
  items: CJOrderItem[]
): Promise<Map<string, VariantCJMapping>> {
  const supabase = createServiceClient();
  const variantIds = items.map((i) => i.variantId);

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, sku, cj_variant_id, ships_from_country, product:products(cj_product_id)"
    )
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
        ships_from_country: v.ships_from_country ?? null,
        product: Array.isArray(v.product) ? v.product[0] : v.product,
      },
    ])
  );
}

async function loadOrderLineItemIds(
  orderId: string
): Promise<Map<string, string>> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId
    )
  ) {
    return new Map();
  }

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
    order.logisticName?.trim() ||
    process.env.CJ_LOGISTIC_NAME?.trim() ||
    "PostNL";
  const email =
    order.email?.trim() || process.env.CJ_EMAIL?.trim() || "";

  return {
    orderNumber: order.orderId,
    shippingZip: shipping.zip?.trim() ?? "",
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
    fromCountryCode:
      order.fromCountryCode?.trim() ||
      process.env.CJ_FROM_COUNTRY_CODE?.trim() ||
      "CN",
    platform: "shopify",
    orderFlow: 1,
    ...(isCjSandboxMode() ? { isSandbox: 1 } : {}),
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

/**
 * Resolve warehouse-matched fromCountryCode + logisticName via freightCalculate.
 * Skipped when caller already supplied both (sandbox script / tests).
 */
async function resolveOrderLogistics(
  order: CJOrderInput,
  mappings: Map<string, VariantCJMapping>
): Promise<
  | { fromCountryCode: string; logisticName: string }
  | { error: string }
> {
  if (order.logisticName?.trim() && order.fromCountryCode?.trim()) {
    return {
      fromCountryCode: order.fromCountryCode.trim().toUpperCase(),
      logisticName: order.logisticName.trim(),
    };
  }

  const origins = new Set<string>();
  const freightProducts: CjFreightProduct[] = [];

  for (const item of order.items) {
    const mapped = mappings.get(item.variantId);
    if (!mapped?.cj_variant_id) continue;
    origins.add(warehouseFromCountryCode(mapped.ships_from_country));
    freightProducts.push({
      vid: mapped.cj_variant_id,
      quantity: item.qty,
    });
  }

  if (freightProducts.length === 0) {
    return { error: "No CJ variants to quote logistics for" };
  }

  if (origins.size > 1) {
    return {
      error: `Order mixes warehouse origins (${[...origins].join(", ")}) — cannot select a single CJ logistics route`,
    };
  }

  const fromCountryCode = [...origins][0];
  const endCountryCode = toCountryCode(order.shipping.country);

  const options = await getValidLogisticsOptions(
    freightProducts,
    fromCountryCode,
    endCountryCode
  );

  if (options.length === 0) {
    return {
      error: `No CJ logistics available for ${fromCountryCode}→${endCountryCode}`,
    };
  }

  return {
    fromCountryCode,
    logisticName: options[0].logisticName,
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

  const logistics = await resolveOrderLogistics(order, mappings);
  if ("error" in logistics) {
    console.error(
      `[CJ] Logistics resolution failed for order ${order.orderId}:`,
      logistics.error
    );
    return { success: false, error: logistics.error };
  }

  const orderWithLogistics: CJOrderInput = {
    ...order,
    fromCountryCode: logistics.fromCountryCode,
    logisticName: logistics.logisticName,
  };

  const payload = buildCreateOrderPayload(
    orderWithLogistics,
    mappings,
    lineItemIds
  );

  console.log(
    `[CJ] createOrderV2 logistics: ${logistics.fromCountryCode}→${toCountryCode(order.shipping.country)} via "${logistics.logisticName}"`
  );

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
    const interceptReasons = normalizeInterceptReasons(
      body.data?.interceptOrderReasons
    );

    if (interceptReasons.length > 0) {
      const cjOrderId =
        body.data?.orderId?.trim() ||
        body.data?.orderNumber?.trim() ||
        null;
      console.warn(
        "[CJ] createOrderV2 intercepted — order must not be treated as fulfilled:",
        JSON.stringify({
          aruviahOrderId: order.orderId,
          cjOrderId,
          httpStatus: res.status,
          code: body.code,
          message: body.message,
          requestId: body.requestId,
          interceptOrderReasons: interceptReasons,
        })
      );
      return {
        intercepted: true,
        reasons: interceptReasons,
        cjOrderId,
      };
    }

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

    const cjOrderId = body.data?.orderId ?? body.data?.orderNumber;
    if (!cjOrderId) {
      console.error(
        "[CJ] createOrderV2 succeeded but response missing order id fields:",
        body
      );
      return { success: false, error: "CJ response missing order id" };
    }

    const shipmentOrderId = body.data?.shipmentOrderId?.trim() || null;
    const payId = body.data?.payId?.trim() || null;
    const amountUsd =
      parseFloat(String(body.data?.actualPayment ?? "")) ||
      parseFloat(String(body.data?.orderAmount ?? "")) ||
      0;

    console.log(
      `[CJ] Order created: aruviah=${order.orderId} cj=${cjOrderId} shipment=${shipmentOrderId ?? "—"}${isCjSandboxMode() ? " (sandbox)" : ""}`
    );
    return {
      success: true,
      cjOrderId,
      shipmentOrderId,
      payId,
      orderAmountUsd: Math.round(amountUsd * 100) / 100,
    };
  } catch (err) {
    console.error("[CJ] createOrderV2 request error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown CJ API error",
    };
  }
}

/** GET /shopping/order/getOrderDetail */
export async function getCjOrderDetail(
  cjOrderId: string
): Promise<CjOrderDetailData | null> {
  const token = await resolveCJAccessToken();
  if (!token) return null;

  try {
    const url = `${CJ_API_BASE}/shopping/order/getOrderDetail?orderId=${encodeURIComponent(cjOrderId)}`;
    const res = await fetch(url, {
      headers: { "CJ-Access-Token": token },
    });
    const body = (await res.json()) as CJApiEnvelope<CjOrderDetailData>;
    if (!res.ok || body.code !== 200 || !body.result || !body.data) {
      console.error(
        "[CJ] getOrderDetail failed:",
        JSON.stringify({
          httpStatus: res.status,
          code: body.code,
          message: body.message,
          cjOrderId,
        })
      );
      return null;
    }
    return body.data;
  } catch (err) {
    console.error("[CJ] getOrderDetail request error:", err);
    return null;
  }
}

/** POST /logistic/freightCalculate — available carriers for a variant route. */
export async function getValidLogisticsOptions(
  products: CjFreightProduct[],
  startCountryCode: string,
  endCountryCode: string
): Promise<CjFreightOption[]> {
  const token = await resolveCJAccessToken();
  if (!token || products.length === 0) return [];

  const normalizedProducts = products
    .filter((p) => p.vid?.trim() && p.quantity > 0)
    .map((p) => ({ vid: p.vid.trim(), quantity: p.quantity }));

  if (normalizedProducts.length === 0) return [];

  const payload = {
    startCountryCode: startCountryCode.trim().toUpperCase(),
    endCountryCode: endCountryCode.trim().toUpperCase(),
    products: normalizedProducts,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const now = Date.now();
    const waitMs =
      FREIGHT_CALCULATE_MIN_INTERVAL_MS - (now - lastFreightCalculateAt);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastFreightCalculateAt = Date.now();

    try {
      const res = await fetch(`${CJ_API_BASE}/logistic/freightCalculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CJ-Access-Token": token,
        },
        body: JSON.stringify(payload),
      });

      const body = (await res.json()) as CJApiEnvelope<
        Array<{
          logisticName?: string;
          logisticPrice?: number | string;
          logisticPriceCn?: number | string;
          logisticAging?: string;
          taxesFee?: number | string;
          clearanceOperationFee?: number | string;
          totalPostageFee?: number | string;
        }>
      >;

      const rateLimited = res.status === 429 || body.code === 1600200;
      if (rateLimited && attempt === 0) {
        console.warn("[CJ] freightCalculate rate limited — retrying");
        continue;
      }

      if (
        !res.ok ||
        body.code !== 200 ||
        !body.result ||
        !Array.isArray(body.data)
      ) {
        console.error(
          "[CJ] freightCalculate failed:",
          JSON.stringify({
            httpStatus: res.status,
            code: body.code,
            message: body.message,
            products: normalizedProducts.map((p) => p.vid),
            startCountryCode,
            endCountryCode,
          })
        );
        return [];
      }

      return body.data
        .filter((row) => row.logisticName?.trim())
        .map((row) => ({
          logisticName: row.logisticName!.trim(),
          logisticPrice: parseFloat(String(row.logisticPrice ?? 0)) || 0,
          logisticPriceCn:
            row.logisticPriceCn != null
              ? parseFloat(String(row.logisticPriceCn)) || null
              : null,
          logisticAging: row.logisticAging?.trim() || null,
          taxesFee:
            row.taxesFee != null
              ? parseFloat(String(row.taxesFee)) || null
              : null,
          clearanceOperationFee:
            row.clearanceOperationFee != null
              ? parseFloat(String(row.clearanceOperationFee)) || null
              : null,
          totalPostageFee:
            row.totalPostageFee != null
              ? parseFloat(String(row.totalPostageFee)) || null
              : null,
        }));
    } catch (err) {
      console.error("[CJ] freightCalculate request error:", err);
      return [];
    }
  }

  return [];
}

/** GET /logistic/trackInfo — live carrier status for a tracking number. */
export async function getCjTrackInfo(
  trackNumber: string
): Promise<CjTrackInfoData | null> {
  const trimmed = trackNumber.trim();
  if (!trimmed) return null;

  const token = await resolveCJAccessToken();
  if (!token) return null;

  try {
    const url = `${CJ_API_BASE}/logistic/trackInfo?trackNumber=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, { headers: { "CJ-Access-Token": token } });
    const body = (await res.json()) as CJApiEnvelope<CjTrackInfoData[]>;

    if (!res.ok || body.code !== 200 || !body.result || !Array.isArray(body.data)) {
      console.error(
        "[CJ] trackInfo failed:",
        JSON.stringify({
          httpStatus: res.status,
          code: body.code,
          message: body.message,
          trackNumber: trimmed,
        })
      );
      return null;
    }

    const row =
      body.data.find(
        (r) => r.trackingNumber?.trim() === trimmed
      ) ?? body.data[0];

    return row ?? null;
  } catch (err) {
    console.error("[CJ] trackInfo request error:", err);
    return null;
  }
}

/** GET /shopping/order/getOrderLogisticsInfo */
export async function getCjOrderLogisticsOptions(
  orderCode: string
): Promise<CjLogisticsOption[]> {
  const token = await resolveCJAccessToken();
  if (!token) return [];

  try {
    const url = `${CJ_API_BASE}/shopping/order/getOrderLogisticsInfo?orderCode=${encodeURIComponent(orderCode)}`;
    const res = await fetch(url, { headers: { "CJ-Access-Token": token } });
    const body = (await res.json()) as CJApiEnvelope<CjLogisticsOption[]>;
    if (!res.ok || body.code !== 200 || !body.result || !Array.isArray(body.data)) {
      return [];
    }
    return body.data;
  } catch {
    return [];
  }
}

/** POST /shopping/order/updateLogistics */
export async function updateCjOrderLogistics(input: {
  id: number;
  orderCode: string;
  logisticsName: string;
  orderAreaId?: number;
  areaEnName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await resolveCJAccessToken();
  if (!token) return { ok: false, error: "CJ authentication failed" };

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/order/updateLogistics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify({
        id: input.id,
        orderCode: input.orderCode,
        logisticsName: input.logisticsName,
        orderAreaId: input.orderAreaId ?? 2,
        areaEnName: input.areaEnName ?? "United States",
        from: 1,
      }),
    });
    const body = (await res.json()) as CJApiEnvelope<unknown>;
    if (!res.ok || body.code !== 200 || !body.result) {
      return { ok: false, error: body.message || `CJ error code ${body.code}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "updateLogistics failed",
    };
  }
}

/** PATCH /shopping/order/confirmOrder — moves CREATED → UNPAID before payment. */
export async function cjConfirmOrder(
  cjOrderId: string
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const token = await resolveCJAccessToken();
  if (!token) return { ok: false, error: "CJ authentication failed" };

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/order/confirmOrder`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify({ orderId: cjOrderId }),
    });
    const body = (await res.json()) as CJApiEnvelope<string>;
    if (!res.ok || body.code !== 200 || !body.result) {
      return { ok: false, error: body.message || `CJ error code ${body.code}` };
    }
    return { ok: true, orderId: String(body.data ?? cjOrderId) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "confirmOrder failed",
    };
  }
}

/** POST /shopping/sandbox/simulatePay — sandbox orders only (isSandbox=1). */
export async function cjSandboxSimulatePay(input: {
  orderId?: string;
  shipmentOrderId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await resolveCJAccessToken();
  if (!token) return { ok: false, error: "CJ authentication failed" };

  const orderId = input.orderId?.trim();
  const shipmentOrderId = input.shipmentOrderId?.trim();
  if (!orderId && !shipmentOrderId) {
    return { ok: false, error: "orderId or shipmentOrderId required" };
  }

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/sandbox/simulatePay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify({
        ...(orderId ? { orderId } : {}),
        ...(shipmentOrderId ? { shipmentOrderId } : {}),
      }),
    });
    const body = (await res.json()) as CJApiEnvelope<boolean>;
    if (!res.ok || body.code !== 200 || !body.result) {
      return { ok: false, error: body.message || `CJ error code ${body.code}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "simulatePay failed",
    };
  }
}

/** POST /shopping/sandbox/updateStatus — sandbox orders only. */
export async function cjSandboxUpdateStatus(
  cjOrderId: string,
  targetStatus: 400 | 500 | 600 | 700
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await resolveCJAccessToken();
  if (!token) return { ok: false, error: "CJ authentication failed" };

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/sandbox/updateStatus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify({ orderId: cjOrderId, targetStatus }),
    });
    const body = (await res.json()) as CJApiEnvelope<boolean>;
    if (!res.ok || body.code !== 200 || !body.result) {
      return { ok: false, error: body.message || `CJ error code ${body.code}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "updateStatus failed",
    };
  }
}
