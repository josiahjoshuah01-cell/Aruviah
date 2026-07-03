/**
 * Seed a paid order with cost snapshot, verify admin profit stats, clean up.
 * Aruviah only. Usage: npx tsx scripts/verify-profit-overview.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { getAdminOverviewStats } from "../lib/admin-queries";

const MARKER = "TEST_PROFIT_OVERVIEW";

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

  const { data: variant } = await sb
    .from("product_variants")
    .select("id, price_usd, shipping_cost_usd, cost_price_usd")
    .eq("is_active", true)
    .not("cost_price_usd", "is", null)
    .limit(1)
    .maybeSingle();

  let variantId = variant?.id;
  let unitPrice = variant ? Number(variant.price_usd) : 22.8;
  let unitCost = variant ? Number(variant.cost_price_usd) : 8.5;
  let shipping = variant ? Number(variant.shipping_cost_usd) : 0;

  if (!variantId) {
    const { data: anyVariant } = await sb
      .from("product_variants")
      .select("id, price_usd, shipping_cost_usd")
      .eq("is_active", true)
      .limit(1)
      .single();
    if (!anyVariant) throw new Error("No active variant");
    variantId = anyVariant.id;
    unitPrice = Number(anyVariant.price_usd);
    shipping = Number(anyVariant.shipping_cost_usd);
    await sb
      .from("product_variants")
      .update({ cost_price_usd: unitCost })
      .eq("id", variantId);
  }

  const userId = (await sb.auth.admin.listUsers({ perPage: 1 })).data.users[0]
    ?.id;
  if (!userId) throw new Error("No auth user for test order");

  const total = unitPrice + shipping;
  const paypalId = `${MARKER}_${Date.now()}`;

  const { data: orderId, error: rpcErr } = await sb.rpc("fulfill_paid_order", {
    p_user_id: userId,
    p_paypal_order_id: paypalId,
    p_total: total,
    p_shipping: {
      firstName: "Test",
      lastName: "Profit",
      address: "1 Margin Way",
      city: "Austin",
      country: "US",
      phone: "555-0101",
    },
    p_items: [
      {
        variant_id: variantId,
        qty: 1,
        price: unitPrice,
        cost_price_usd: unitCost,
      },
    ],
  });

  if (rpcErr || !orderId) throw rpcErr ?? new Error("RPC failed");

  const stats = await getAdminOverviewStats();
  const expectedProfit = unitPrice - unitCost;
  const expectedMargin = (expectedProfit / unitPrice) * 100;

  const report = {
    project: ARUVIAH_SUPABASE_PROJECT_REF,
    seededOrderId: orderId,
    unitPrice,
    unitCost,
    expectedGrossProfitPerUnit: expectedProfit,
    overview: stats,
    pass:
      stats.paidOrderCount >= 1 &&
      stats.grossProfitUsd >= expectedProfit &&
      stats.profitMarginPct != null &&
      Math.abs(stats.profitMarginPct - expectedMargin) < 0.2,
  };

  console.log(JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(process.cwd(), "scripts/verify-profit-overview-report.json"),
    JSON.stringify(report, null, 2)
  );

  await sb.from("order_items").delete().eq("order_id", orderId);
  await sb.from("orders").delete().eq("id", orderId);
  if (!variant) {
    await sb
      .from("product_variants")
      .update({ cost_price_usd: null })
      .eq("id", variantId);
  }

  console.log("\nCleaned up test order.");
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
