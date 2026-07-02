/**
 * CJ dispute API — filing and status only (no negotiation messaging).
 *
 * Docs: https://developers.cjdropshipping.com/en/api/api2/api/dispute.html
 */

import { getCJAccessToken } from "@/lib/cj";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
  requestId?: string;
};

export type CjDisputeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: number };

export type CjDisputeProduct = {
  lineItemId: string;
  cjProductId?: string;
  cjVariantId?: string;
  canChoose: boolean;
  price: number;
  quantity: number;
  cjProductName?: string;
  cjImage?: string;
  sku?: string;
  supplierName?: string;
};

export type CjDisputeEligibleProducts = {
  orderId: string;
  orderNumber?: string;
  productInfoList: CjDisputeProduct[];
};

export type CjDisputeReason = {
  disputeReasonId: number;
  reasonName: string;
};

export type CjDisputeConfirmInfo = {
  orderId: string;
  orderNumber?: string;
  maxProductPrice: number;
  maxPostage: number;
  maxAmount: number;
  expectResultOptionList: string[];
  disputeReasonList: CjDisputeReason[];
  productInfoList: CjDisputeProduct[];
};

export type CjDisputeListItem = {
  id: string;
  status: string;
  disputeReason: string;
  replacementAmount?: number;
  resendOrderCode?: string;
  money?: number;
  finallyDeal?: number | null;
  createDate?: string;
};

export type CjDisputeList = {
  pageNum: number;
  pageSize: number;
  total: number;
  list: CjDisputeListItem[];
};

export type CjDisputeDetail = {
  id: string;
  status: string;
  disputeReason: string;
  replacementAmount?: number;
  resendOrderCode?: string;
  money?: number;
  refundAmount?: number;
  finallyDeal?: number | null;
  createDate?: string | number;
};

export type CjDisputeProductInput = {
  lineItemId: string;
  quantity: number;
  price: number;
};

async function cjDisputeRequest<T>(
  path: string,
  init?: RequestInit
): Promise<CjDisputeResult<T>> {
  const token = await getCJAccessToken();
  if (!token) {
    return { ok: false, error: "CJ authentication failed" };
  }

  try {
    const res = await fetch(`${CJ_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
        ...init?.headers,
      },
    });

    const parsed = (await res.json()) as CJApiEnvelope<T>;

    if (!res.ok || parsed.code !== 200 || !parsed.result) {
      const message =
        parsed.message?.trim() ||
        `CJ request failed (HTTP ${res.status}, code ${parsed.code})`;
      console.error(
        `[CJ] dispute ${path} failed:`,
        JSON.stringify({
          httpStatus: res.status,
          code: parsed.code,
          message: parsed.message,
          requestId: parsed.requestId,
        })
      );
      return { ok: false, error: message, code: parsed.code };
    }

    if (parsed.data === undefined || parsed.data === null) {
      return { ok: false, error: "CJ returned empty data" };
    }

    return { ok: true, data: parsed.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CJ request failed";
    console.error(`[CJ] dispute ${path} error:`, message);
    return { ok: false, error: message };
  }
}

function mapProduct(row: Record<string, unknown>): CjDisputeProduct {
  return {
    lineItemId: String(row.lineItemId ?? ""),
    cjProductId: row.cjProductId ? String(row.cjProductId) : undefined,
    cjVariantId: row.cjVariantId ? String(row.cjVariantId) : undefined,
    canChoose: Boolean(row.canChoose),
    price: Number(row.price ?? 0),
    quantity: Number(row.quantity ?? 0),
    cjProductName: row.cjProductName ? String(row.cjProductName) : undefined,
    cjImage: row.cjImage ? String(row.cjImage) : undefined,
    sku: row.sku ? String(row.sku) : undefined,
    supplierName: row.supplierName ? String(row.supplierName) : undefined,
  };
}

/** GET /disputes/disputeProducts */
export async function getDisputeEligibleProducts(
  cjOrderId: string
): Promise<CjDisputeResult<CjDisputeEligibleProducts>> {
  const orderId = cjOrderId.trim();
  if (!orderId) {
    return { ok: false, error: "Missing CJ order id" };
  }

  const result = await cjDisputeRequest<Record<string, unknown>>(
    `/disputes/disputeProducts?orderId=${encodeURIComponent(orderId)}`,
    { method: "GET" }
  );

  if (!result.ok) return result;

  const raw = result.data;
  const list = Array.isArray(raw.productInfoList)
    ? raw.productInfoList.map((p) => mapProduct(p as Record<string, unknown>))
    : [];

  return {
    ok: true,
    data: {
      orderId: String(raw.orderId ?? orderId),
      orderNumber: raw.orderNumber ? String(raw.orderNumber) : undefined,
      productInfoList: list,
    },
  };
}

/** POST /disputes/disputeConfirmInfo — must run before create */
export async function getDisputeConfirmInfo(
  cjOrderId: string,
  productInfoList: CjDisputeProductInput[]
): Promise<CjDisputeResult<CjDisputeConfirmInfo>> {
  const orderId = cjOrderId.trim();
  if (!orderId) {
    return { ok: false, error: "Missing CJ order id" };
  }
  if (!productInfoList.length) {
    return { ok: false, error: "Select at least one line item" };
  }

  const result = await cjDisputeRequest<Record<string, unknown>>(
    "/disputes/disputeConfirmInfo",
    {
      method: "POST",
      body: JSON.stringify({
        orderId,
        productInfoList: productInfoList.map((p) => ({
          lineItemId: p.lineItemId,
          quantity: p.quantity,
          price: p.price,
        })),
      }),
    }
  );

  if (!result.ok) return result;

  const raw = result.data;
  const reasons = Array.isArray(raw.disputeReasonList)
    ? raw.disputeReasonList.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          disputeReasonId: Number(row.disputeReasonId),
          reasonName: String(row.reasonName ?? ""),
        };
      })
    : [];

  const products = Array.isArray(raw.productInfoList)
    ? raw.productInfoList.map((p) => mapProduct(p as Record<string, unknown>))
    : [];

  return {
    ok: true,
    data: {
      orderId: String(raw.orderId ?? orderId),
      orderNumber: raw.orderNumber ? String(raw.orderNumber) : undefined,
      maxProductPrice: Number(raw.maxProductPrice ?? 0),
      maxPostage: Number(raw.maxPostage ?? 0),
      maxAmount: Number(raw.maxAmount ?? 0),
      expectResultOptionList: Array.isArray(raw.expectResultOptionList)
        ? raw.expectResultOptionList.map(String)
        : [],
      disputeReasonList: reasons,
      productInfoList: products,
    },
  };
}

export type CreateDisputeInput = {
  cjOrderId: string;
  businessDisputeId: string;
  disputeReasonId: number;
  expectType: 1 | 2;
  refundType: 1 | 2;
  messageText: string;
  imageUrl?: string[];
  productInfoList: CjDisputeProductInput[];
};

/** POST /disputes/create */
export async function createDispute(
  input: CreateDisputeInput
): Promise<CjDisputeResult<true>> {
  const orderId = input.cjOrderId.trim();
  const messageText = input.messageText.trim();

  if (!orderId) return { ok: false, error: "Missing CJ order id" };
  if (!messageText) return { ok: false, error: "Message is required" };
  if (!input.productInfoList.length) {
    return { ok: false, error: "Select at least one line item" };
  }

  const result = await cjDisputeRequest<boolean>("/disputes/create", {
    method: "POST",
    body: JSON.stringify({
      orderId,
      businessDisputeId: input.businessDisputeId,
      disputeReasonId: input.disputeReasonId,
      expectType: input.expectType,
      refundType: input.refundType,
      messageText,
      imageUrl: input.imageUrl?.filter(Boolean) ?? [],
      productInfoList: input.productInfoList.map((p) => ({
        lineItemId: p.lineItemId,
        quantity: p.quantity,
        price: p.price,
      })),
    }),
  });

  if (!result.ok) return result;
  return { ok: true, data: true };
}

/** POST /disputes/cancel */
export async function cancelDispute(
  cjOrderId: string,
  disputeId: string
): Promise<CjDisputeResult<true>> {
  const orderId = cjOrderId.trim();
  const id = disputeId.trim();
  if (!orderId || !id) {
    return { ok: false, error: "Missing CJ order or dispute id" };
  }

  const result = await cjDisputeRequest<boolean>("/disputes/cancel", {
    method: "POST",
    body: JSON.stringify({ orderId, disputeId: id }),
  });

  if (!result.ok) return result;
  return { ok: true, data: true };
}

/** GET /disputes/getDisputeList */
export async function getDisputeList(options?: {
  cjOrderId?: string;
  pageNum?: number;
  pageSize?: number;
}): Promise<CjDisputeResult<CjDisputeList>> {
  const params = new URLSearchParams();
  if (options?.cjOrderId?.trim()) {
    params.set("orderId", options.cjOrderId.trim());
  }
  if (options?.pageNum) params.set("pageNum", String(options.pageNum));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));

  const qs = params.toString();
  const result = await cjDisputeRequest<Record<string, unknown>>(
    `/disputes/getDisputeList${qs ? `?${qs}` : ""}`,
    { method: "GET" }
  );

  if (!result.ok) return result;

  const raw = result.data;
  const list = Array.isArray(raw.list)
    ? raw.list.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: String(item.id ?? ""),
          status: String(item.status ?? ""),
          disputeReason: String(item.disputeReason ?? ""),
          replacementAmount:
            item.replacementAmount != null
              ? Number(item.replacementAmount)
              : undefined,
          resendOrderCode: item.resendOrderCode
            ? String(item.resendOrderCode)
            : undefined,
          money: item.money != null ? Number(item.money) : undefined,
          finallyDeal:
            item.finallyDeal != null ? Number(item.finallyDeal) : null,
          createDate: item.createDate ? String(item.createDate) : undefined,
        };
      })
    : [];

  return {
    ok: true,
    data: {
      pageNum: Number(raw.pageNum ?? 1),
      pageSize: Number(raw.pageSize ?? 10),
      total: Number(raw.total ?? list.length),
      list,
    },
  };
}

/** GET /disputes/getDisputeDetail */
export async function getDisputeDetail(
  disputeId: string
): Promise<CjDisputeResult<CjDisputeDetail>> {
  const id = disputeId.trim();
  if (!id) return { ok: false, error: "Missing dispute id" };

  const result = await cjDisputeRequest<Record<string, unknown>>(
    `/disputes/getDisputeDetail?disputeId=${encodeURIComponent(id)}`,
    { method: "GET" }
  );

  if (!result.ok) return result;

  const raw = result.data;
  return {
    ok: true,
    data: {
      id: String(raw.id ?? id),
      status: String(raw.status ?? ""),
      disputeReason: String(raw.disputeReason ?? ""),
      replacementAmount:
        raw.replacementAmount != null
          ? Number(raw.replacementAmount)
          : undefined,
      resendOrderCode: raw.resendOrderCode
        ? String(raw.resendOrderCode)
        : undefined,
      money: raw.money != null ? Number(raw.money) : undefined,
      refundAmount:
        raw.refundAmount != null ? Number(raw.refundAmount) : undefined,
      finallyDeal: raw.finallyDeal != null ? Number(raw.finallyDeal) : null,
      createDate: raw.createDate as string | number | undefined,
    },
  };
}

export function buildBusinessDisputeId(
  orderId: string,
  now = Date.now()
): string {
  const compact = orderId.replace(/-/g, "").slice(0, 12);
  return `arv-${compact}-${now}`;
}
