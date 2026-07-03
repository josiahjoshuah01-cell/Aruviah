/**
 * Verify CJ stock refresh + checkout live-stock block.
 * Aruviah only. Usage: npx tsx scripts/verify-cj-stock-refresh.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import {
  queryCjStockByVid,
  refreshLiveCjStock,
  verifyCjLiveStockAtCheckout,
} from "../lib/cj-stock";

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

  const report: Record<string, unknown> = { steps: [] as string[] };
  const log = (msg: string) => {
    (report.steps as string[]).push(msg);
    console.log(msg);
  };

  const { data: variant, error } = await sb
    .from("product_variants")
    .select("id, sku, stock, cj_variant_id, product:products(title)")
    .not("cj_variant_id", "is", null)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !variant?.cj_variant_id) {
    throw new Error("No CJ-mapped active variant found for stock test");
  }

  const product = Array.isArray(variant.product)
    ? variant.product[0]
    : variant.product;
  const title = product?.title ?? "Product";
  const localBefore = Number(variant.stock);
  const cjVid = variant.cj_variant_id;

  log(`Variant ${variant.sku} (${variant.id.slice(0, 8)}…)`);
  log(`Local stock before: ${localBefore}`);

  const liveCj = await queryCjStockByVid(cjVid);
  if (liveCj == null) throw new Error("CJ stock query failed");
  log(`CJ live stock (queryByVid): ${liveCj}`);

  const [refreshResult] = await refreshLiveCjStock([
    { id: variant.id, cj_variant_id: cjVid, sku: variant.sku },
  ]);
  log(
    `refreshLiveCjStock: ${refreshResult.before} → ${refreshResult.after} (CJ=${refreshResult.cjStock})`
  );
  report.stockRefresh = refreshResult;

  if (refreshResult.after !== liveCj) {
    throw new Error("Local stock not synced to CJ after refresh");
  }
  log("PASS: stock refresh synced local to CJ");

  const okCheck = await verifyCjLiveStockAtCheckout([
    { variantId: variant.id, qty: 1, title },
  ]);
  if (!okCheck.ok) {
    throw new Error(`Expected checkout pass at qty=1, got: ${okCheck.error}`);
  }
  log("PASS: checkout allows qty=1 when CJ has stock");

  const savedStock = refreshResult.after;
  await sb
    .from("product_variants")
    .update({ stock: 999 })
    .eq("id", variant.id);
  log(
    `Simulated stale local stock: set local to 999 (CJ live remains ${liveCj})`
  );

  if (liveCj === 0) {
    const blockedAtZero = await verifyCjLiveStockAtCheckout([
      { variantId: variant.id, qty: 1, title },
    ]);
    if (blockedAtZero.ok) {
      throw new Error("Expected block when CJ live stock is 0");
    }
    log(`PASS: checkout blocked when CJ live is 0: ${blockedAtZero.error}`);
    report.zeroStockBlock = blockedAtZero;
  } else {
    const staleAllows = await verifyCjLiveStockAtCheckout([
      { variantId: variant.id, qty: 1, title },
    ]);
    if (!staleAllows.ok) {
      throw new Error(
        `Stale local high but CJ has stock — should allow: ${staleAllows.error}`
      );
    }
    log("PASS: stale local stock ignored — CJ live stock authorizes checkout");

    const blocked = await verifyCjLiveStockAtCheckout([
      { variantId: variant.id, qty: liveCj + 1, title },
    ]);
    if (blocked.ok) {
      throw new Error("Expected block when qty exceeds CJ live stock");
    }
    log(`PASS: checkout blocked when qty > CJ stock: ${blocked.error}`);
    report.checkoutBlock = blocked;
  }

  await sb
    .from("product_variants")
    .update({ stock: savedStock })
    .eq("id", variant.id);
  log(`Restored local stock to ${savedStock}`);

  report.ok = true;
  const outPath = resolve(process.cwd(), "scripts/verify-cj-stock-refresh.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
