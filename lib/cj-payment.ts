/**
 * CJ wallet payment — payBalanceV2 after createOrderV2.
 *
 * Confirmed CJ docs (shopping API):
 *   POST /api2.0/v1/shopping/pay/payBalanceV2
 *   Body: { shipmentOrderId: string (required), payId?: string (optional) }
 *   Success: { code: 200, result: true, message: "Success", data: null }
 *
 * createOrderV2 returns shipmentOrderId + optional payId for balance payment.
 */

import { getCJAccessToken } from "@/lib/cj";
import {
  getAdminSettings,
  getTodayAutoPaidTotalUsd,
  wouldExceedAutoPayCap,
} from "@/lib/admin-settings";
import type { CjAutoPayOutcome } from "@/lib/cj-payment-types";
import { createServiceClient } from "@/lib/supabase/admin";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

export type PayBalanceV2Input = {
  shipmentOrderId: string;
  payId?: string | null;
};

export type PayBalanceV2Result =
  | { success: true }
  | { success: false; error: string };

/**
 * POST /shopping/pay/payBalanceV2 — deduct CJ wallet balance for a shipment order.
 */
export async function payCJBalanceV2(
  input: PayBalanceV2Input
): Promise<PayBalanceV2Result> {
  const shipmentOrderId = input.shipmentOrderId?.trim();
  if (!shipmentOrderId) {
    return { success: false, error: "Missing CJ shipment order id" };
  }

  const token = await getCJAccessToken();
  if (!token) {
    return { success: false, error: "CJ authentication failed" };
  }

  const body: Record<string, string> = { shipmentOrderId };
  if (input.payId?.trim()) {
    body.payId = input.payId.trim();
  }

  try {
    const res = await fetch(`${CJ_API_BASE}/shopping/pay/payBalanceV2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify(body),
    });

    const parsed = (await res.json()) as CJApiEnvelope<null>;

    if (!res.ok || parsed.code !== 200 || !parsed.result) {
      console.error(
        "[CJ] payBalanceV2 failed:",
        JSON.stringify({
          httpStatus: res.status,
          code: parsed.code,
          message: parsed.message,
          shipmentOrderId,
        })
      );
      return {
        success: false,
        error: parsed.message || `CJ payBalanceV2 error (code ${parsed.code})`,
      };
    }

    console.log(`[CJ] payBalanceV2 succeeded for shipmentOrderId=${shipmentOrderId}`);
    return { success: true };
  } catch (err) {
    console.error("[CJ] payBalanceV2 request error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "payBalanceV2 request failed",
    };
  }
}

export function parseCjOrderAmountUsd(
  orderAmount?: string | number | null,
  actualPayment?: string | number | null,
  fallbackTotal?: number
): number {
  for (const raw of [actualPayment, orderAmount, fallbackTotal]) {
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  return fallbackTotal != null && Number.isFinite(fallbackTotal)
    ? Math.round(fallbackTotal * 100) / 100
    : 0;
}

async function logAutoPayAttempt(params: {
  orderId: string;
  shipmentOrderId: string | null;
  amountUsd: number;
  outcome: CjAutoPayOutcome;
  errorMessage?: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("cj_auto_pay_logs").insert({
    order_id: params.orderId,
    cj_shipment_order_id: params.shipmentOrderId,
    amount_usd: params.amountUsd,
    outcome: params.outcome,
    error_message: params.errorMessage ?? null,
  });
  if (error) {
    console.error("[cj-payment] failed to write auto-pay log:", error);
  }
}

export type TryAutoPayResult =
  | { attempted: false; reason: "disabled" }
  | { attempted: true; paid: true }
  | { attempted: true; paid: false; reason: "cap_blocked" | "api_failed" };

/**
 * Opt-in auto-pay immediately after createOrderV2. Never throws — failures
 * leave cj_payment_status = 'unpaid' for manual payment on CJ.
 */
export async function tryAutoPayCjOrder(orderId: string): Promise<TryAutoPayResult> {
  const supabase = createServiceClient();
  const settings = await getAdminSettings();

  if (!settings.cj_auto_pay_enabled) {
    return { attempted: false, reason: "disabled" };
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, total, cj_payment_status, cj_order_id, cj_shipment_order_id, cj_pay_id, cj_order_amount_usd"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    console.error("[cj-payment] order not found for auto-pay:", orderId, error);
    return { attempted: true, paid: false, reason: "api_failed" };
  }

  if (order.cj_payment_status !== "unpaid") {
    return { attempted: false, reason: "disabled" };
  }

  const shipmentOrderId =
    order.cj_shipment_order_id?.trim() || order.cj_order_id?.trim() || "";
  if (!shipmentOrderId) {
    await logAutoPayAttempt({
      orderId,
      shipmentOrderId: null,
      amountUsd: Number(order.cj_order_amount_usd ?? order.total),
      outcome: "failed",
      errorMessage: "Missing CJ shipment order id for payBalanceV2",
    });
    return { attempted: true, paid: false, reason: "api_failed" };
  }

  const amountUsd = Number(order.cj_order_amount_usd ?? order.total);
  const todayPaid = await getTodayAutoPaidTotalUsd();

  if (
    wouldExceedAutoPayCap(todayPaid, amountUsd, settings.cj_auto_pay_daily_cap_usd)
  ) {
    await logAutoPayAttempt({
      orderId,
      shipmentOrderId,
      amountUsd,
      outcome: "cap_blocked",
      errorMessage: `Daily cap $${settings.cj_auto_pay_daily_cap_usd.toFixed(2)} would be exceeded (today: $${todayPaid.toFixed(2)}, order: $${amountUsd.toFixed(2)})`,
    });
    return { attempted: true, paid: false, reason: "cap_blocked" };
  }

  const payResult = await payCJBalanceV2({
    shipmentOrderId,
    payId: order.cj_pay_id,
  });

  if (!payResult.success) {
    await logAutoPayAttempt({
      orderId,
      shipmentOrderId,
      amountUsd,
      outcome: "failed",
      errorMessage: payResult.error,
    });
    return { attempted: true, paid: false, reason: "api_failed" };
  }

  await supabase
    .from("orders")
    .update({ cj_payment_status: "paid" })
    .eq("id", orderId);

  await logAutoPayAttempt({
    orderId,
    shipmentOrderId,
    amountUsd,
    outcome: "success",
  });

  return { attempted: true, paid: true };
}
