/**
 * Verify CJ intercept handling stores raw reasons on orders.
 * Aruviah only. Usage: npx tsx scripts/verify-cj-intercept-handling.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { applyCJFulfillmentResult } from "../lib/orders";
import {
  getFulfillmentStuckKind,
  inferFulfillmentStuckReason,
} from "../lib/admin-queries";
import { formatCjInterceptReasons } from "../lib/cj-intercept-display";

const MARKER = "TEST_CJ_INTERCEPT";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  if (!url.includes(ARUVIAH_SUPABASE_PROJECT_REF)) {
    throw new Error(`Wrong project — need ${ARUVIAH_SUPABASE_PROJECT_REF}`);
  }
  assertAruviahProjectRef(ARUVIAH_SUPABASE_PROJECT_REF);

  const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = (await sb.auth.admin.listUsers({ perPage: 1 })).data.users[0]
    ?.id;
  if (!userId) throw new Error("No auth user");

  const { data: variant } = await sb
    .from("product_variants")
    .select("id, price_usd, shipping_cost_usd")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!variant) throw new Error("No active variant for test order");

  const total =
    Number(variant.price_usd) + Number(variant.shipping_cost_usd ?? 0);
  const paypalId = `${MARKER}_${Date.now()}`;
  const { data: orderId, error: rpcErr } = await sb.rpc("fulfill_paid_order", {
    p_user_id: userId,
    p_paypal_order_id: paypalId,
    p_total: total,
    p_shipping: {
      firstName: "Test",
      lastName: "Intercept",
      address: "1 Test St",
      city: "Testville",
      country: "US",
      phone: "5550000",
    },
    p_items: [{ variant_id: variant.id, qty: 1, price: variant.price_usd }],
  });

  if (rpcErr || !orderId) throw new Error(`RPC failed: ${rpcErr?.message}`);

  const rawReasons = [
    { code: "SIMULATED_INTERCEPT", message: "Simulated CJ stock block for test" },
    { reasonCode: "DELISTED", desc: "Product removed from CJ catalog" },
  ];

  await applyCJFulfillmentResult(orderId as string, {
    intercepted: true,
    reasons: rawReasons,
    cjOrderId: "CJ_SIMULATED_ORDER_ID",
  });

  const { data: order, error } = await sb
    .from("orders")
    .select("status, cj_intercept_reasons, fulfillment_note, cj_order_id")
    .eq("id", orderId)
    .single();

  if (error || !order) throw new Error("Failed to load test order");

  const report = {
    status: order.status,
    cj_intercept_reasons: order.cj_intercept_reasons,
    fulfillment_note: order.fulfillment_note,
    cj_order_id: order.cj_order_id,
    stuckKind: getFulfillmentStuckKind({
      ...order,
      id: orderId as string,
      user_id: userId,
      customer_email: null,
      total: 1,
      currency: "USD",
      paypal_order_id: paypalId,
      cj_shipment_order_id: null,
      cj_payment_status: "not_required",
      cj_order_amount_usd: null,
      tracking_number: null,
      cj_track_number: null,
      cj_tracking_provider: null,
      cj_tracking_url: null,
      cj_tracking_status: null,
      cj_last_mile_carrier: null,
      cj_last_mile_track_number: null,
      shipping: {},
      created_at: new Date().toISOString(),
      cj_intercept_reasons: order.cj_intercept_reasons as unknown[],
    }),
    displayLines: formatCjInterceptReasons(
      (order.cj_intercept_reasons as unknown[]) ?? []
    ),
    inferReason: inferFulfillmentStuckReason({
      id: orderId as string,
      user_id: userId,
      customer_email: null,
      total: 1,
      currency: "USD",
      status: order.status,
      paypal_order_id: paypalId,
      cj_order_id: order.cj_order_id,
      cj_shipment_order_id: null,
      cj_payment_status: "not_required",
      cj_order_amount_usd: null,
      fulfillment_note: order.fulfillment_note,
      cj_intercept_reasons: order.cj_intercept_reasons as unknown[],
      tracking_number: null,
      cj_track_number: null,
      cj_tracking_provider: null,
      cj_tracking_url: null,
      cj_tracking_status: null,
      cj_last_mile_carrier: null,
      cj_last_mile_track_number: null,
      shipping: {},
      created_at: new Date().toISOString(),
    }),
  };

  if (order.status !== "paid_needs_manual_fulfillment") {
    throw new Error(`Wrong status: ${order.status}`);
  }
  if (!Array.isArray(order.cj_intercept_reasons) || order.cj_intercept_reasons.length !== 2) {
    throw new Error("cj_intercept_reasons not stored raw");
  }
  if (report.stuckKind !== "cj_intercept") {
    throw new Error(`Wrong stuck kind: ${report.stuckKind}`);
  }

  console.log("PASS: intercept stored and classified as cj_intercept");
  console.log(JSON.stringify(report, null, 2));

  await sb.from("order_items").delete().eq("order_id", orderId);
  await sb.from("orders").delete().eq("id", orderId);

  const outPath = resolve(
    process.cwd(),
    "scripts/verify-cj-intercept-handling.json"
  );
  writeFileSync(outPath, JSON.stringify({ ok: true, ...report }, null, 2));
  console.log(`\nCleaned up test order. Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
