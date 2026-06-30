/**
 * CJ Dropshipping API 2.0 — fulfillment only.
 *
 * Auth (verified against official docs, Mar 2026):
 *   POST https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken
 *   Body: { "apiKey": "<CJ_API_KEY>" }
 *   Header: Content-Type: application/json
 *
 * Create order (verified):
 *   POST https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV3
 *   Header: CJ-Access-Token, Content-Type: application/json
 *
 * CJ_EMAIL is required in env for configuration validation (account identity).
 * The auth endpoint uses apiKey only per current CJ API 2.0 docs.
 */

import { createServiceClient } from "@/lib/supabase/admin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export type CJOrderItem = {
  productId: string;
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
};

export type CJOrderResult =
  | { success: true; cjOrderId: string }
  | { success: false; error: string }
  | { skipped: true; reason: "unmapped_sku"; unmappedSkus: string[] }
  | { skipped: true; reason: "no_credentials" };

type CJTokenCache = {
  token: string;
  expiresAtMs: number;
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
};

type CJCreateOrderData = {
  orderId?: string;
  orderNumber?: string;
  shipmentOrderId?: string;
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

function hasCredentials(): boolean {
  return !!(process.env.CJ_EMAIL && process.env.CJ_API_KEY);
}

function parseExpiryMs(isoDate: string): number {
  const ms = Date.parse(isoDate);
  return Number.isNaN(ms) ? Date.now() + 14 * 24 * 60 * 60 * 1000 : ms;
}

function toCountryCode(country: string): string {
  const trimmed = country.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const mapped = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return trimmed.slice(0, 2).toUpperCase();
}

export async function getCJToken(): Promise<string | null> {
  if (!hasCredentials()) {
    console.warn(
      "[CJ] Missing CJ_EMAIL or CJ_API_KEY — skipping token fetch (fulfillment disabled)."
    );
    return null;
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.token;
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
        "[CJ] Auth failed:",
        JSON.stringify({ status: res.status, code: body.code, message: body.message })
      );
      return null;
    }

    const expiresAtMs =
      parseExpiryMs(body.data.accessTokenExpiryDate) - 5 * 60 * 1000;

    tokenCache = {
      token: body.data.accessToken,
      expiresAtMs,
    };

    return tokenCache.token;
  } catch (err) {
    console.error("[CJ] Auth request error:", err);
    return null;
  }
}

type ProductCJMapping = {
  id: string;
  sku: string;
  cj_product_id: string | null;
  cj_variant_id: string | null;
};

async function loadCJMappings(
  items: CJOrderItem[]
): Promise<Map<string, ProductCJMapping>> {
  const supabase = createServiceClient();
  const productIds = items.map((i) => i.productId);

  const { data, error } = await supabase
    .from("products")
    .select("id, sku, cj_product_id, cj_variant_id")
    .in("id", productIds);

  if (error || !data) {
    console.error("[CJ] Failed to load product CJ mappings:", error);
    return new Map();
  }

  return new Map(data.map((p) => [p.id, p]));
}

function buildCreateOrderPayload(
  order: CJOrderInput,
  mappings: Map<string, ProductCJMapping>
) {
  const { shipping } = order;
  const countryCode = toCountryCode(shipping.country);
  const logisticName =
    process.env.CJ_LOGISTIC_NAME?.trim() || "CJPacket Ordinary";

  return {
    orderNumber: order.orderId,
    shippingZip: "",
    shippingCountry: shipping.country,
    shippingCountryCode: countryCode,
    shippingProvince: shipping.city,
    shippingCity: shipping.city,
    shippingCounty: "",
    shippingPhone: shipping.phone,
    shippingCustomerName: `${shipping.firstName} ${shipping.lastName}`.trim(),
    shippingAddress: shipping.address,
    shippingAddress2: "",
    houseNumber: "",
    remark: `Aruviah order ${order.orderId}`,
    email: process.env.CJ_EMAIL ?? "",
    platform: "Api",
    fromCountryCode: process.env.CJ_FROM_COUNTRY_CODE?.trim() || "CN",
    logisticName,
    shopLogisticsType: 2,
    orderFlow: 1,
    products: order.items.map((item) => {
      const mapped = mappings.get(item.productId)!;
      return {
        vid: mapped.cj_variant_id,
        quantity: item.qty,
        storeLineItemId: `${order.orderId}-${item.productId}`,
        storeProductId: mapped.cj_product_id ?? undefined,
      };
    }),
  };
}

export async function createCJOrder(order: CJOrderInput): Promise<CJOrderResult> {
  if (!hasCredentials()) {
    console.warn(
      "[CJ] Missing CJ_EMAIL or CJ_API_KEY — cannot fulfill order",
      order.orderId
    );
    return { skipped: true, reason: "no_credentials" };
  }

  const mappings = await loadCJMappings(order.items);
  const unmappedSkus: string[] = [];

  for (const item of order.items) {
    const mapped = mappings.get(item.productId);
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

  const token = await getCJToken();
  if (!token) {
    return {
      success: false,
      error: "CJ authentication failed — check CJ_API_KEY and CJ_EMAIL env vars",
    };
  }

  const payload = buildCreateOrderPayload(order, mappings);

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/order/createOrderV3`, {
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
        "[CJ] createOrderV3 failed:",
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

    const cjOrderId = body.data?.orderId;
    if (!cjOrderId) {
      console.error("[CJ] createOrderV3 succeeded but no orderId in response:", body);
      return { success: false, error: "CJ response missing orderId" };
    }

    console.log(
      `[CJ] Order created: aruviah=${order.orderId} cj=${cjOrderId}`
    );
    return { success: true, cjOrderId };
  } catch (err) {
    console.error("[CJ] createOrderV3 request error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown CJ API error",
    };
  }
}
