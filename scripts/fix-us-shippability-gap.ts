/**
 * Backfill bucket-A ships_from_country, deactivate bucket B/C SKUs.
 * Usage: npx tsx scripts/fix-us-shippability-gap.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";

const CLASSIFICATION_PATH = resolve(
  process.cwd(),
  "scripts/unshippable-us-bucket-classification.json"
);
const OUT_PATH = resolve(process.cwd(), "scripts/fix-us-shippability-gap.json");

const DEACTIVATE_SKUS = ["ARV-00147", "ARV-00137"];

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

async function countNullOrigin(sb: ReturnType<typeof createClient>) {
  const { count, error } = await sb
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .is("ships_from_country", null)
    .eq("is_active", true);

  if (error) throw error;
  return count ?? 0;
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

  const classification = JSON.parse(
    readFileSync(CLASSIFICATION_PATH, "utf8")
  ) as {
    classifications: Array<{ sku: string; bucket: string }>;
  };

  const bucketASkus = classification.classifications
    .filter((c) => c.bucket === "A")
    .map((c) => c.sku);

  const report: Record<string, unknown> = {
    bucketASkusExpected: bucketASkus.length,
    backfill: {} as Record<string, unknown>,
    deactivations: [] as unknown[],
  };

  const nullBefore = await countNullOrigin(sb);
  report.nullOriginActiveBefore = nullBefore;

  const { data: beforeRows, error: beforeErr } = await sb
    .from("product_variants")
    .select("sku, ships_from_country")
    .in("sku", bucketASkus);

  if (beforeErr) throw beforeErr;

  const { data: updated, error: updateErr } = await sb
    .from("product_variants")
    .update({ ships_from_country: "US" })
    .in("sku", bucketASkus)
    .select("sku, ships_from_country");

  if (updateErr) throw updateErr;

  report.backfill = {
    requested: bucketASkus.length,
    updated: updated?.length ?? 0,
    skus: updated?.map((r) => r.sku).sort(),
    stillNotUs: (updated ?? []).filter((r) => r.ships_from_country !== "US"),
    missingFromDb: bucketASkus.filter(
      (sku) => !(beforeRows ?? []).some((r) => r.sku === sku)
    ),
  };

  const nullAfterBackfill = await countNullOrigin(sb);
  report.nullOriginActiveAfterBackfill = nullAfterBackfill;

  for (const sku of DEACTIVATE_SKUS) {
    const { data: variant, error: vErr } = await sb
      .from("product_variants")
      .select("id, sku, product_id, is_active")
      .eq("sku", sku)
      .maybeSingle();

    if (vErr || !variant) {
      (report.deactivations as unknown[]).push({
        sku,
        error: vErr?.message ?? "Variant not found",
      });
      continue;
    }

    const { data: orderItems, error: oiErr } = await sb
      .from("order_items")
      .select("id, order_id")
      .eq("variant_id", variant.id);

    if (oiErr) throw oiErr;

    const { error: deactErr } = await sb
      .from("product_variants")
      .update({ is_active: false })
      .eq("id", variant.id);

    if (deactErr) throw deactErr;

    const { data: siblings } = await sb
      .from("product_variants")
      .select("id, is_active")
      .eq("product_id", variant.product_id);

    const anyActive = (siblings ?? []).some((s) => s.is_active);
    if (!anyActive) {
      await sb
        .from("products")
        .update({ is_active: false })
        .eq("id", variant.product_id);
    }

    const { data: after } = await sb
      .from("product_variants")
      .select("sku, is_active")
      .eq("id", variant.id)
      .single();

    (report.deactivations as unknown[]).push({
      sku,
      variantId: variant.id,
      productId: variant.product_id,
      wasActive: variant.is_active,
      nowActive: after?.is_active,
      orderHistoryCount: orderItems?.length ?? 0,
      orderIds: (orderItems ?? []).map((o) => o.order_id),
      productAlsoDeactivated: !anyActive,
      action: "deactivated (not deleted)",
    });
  }

  const nullFinal = await countNullOrigin(sb);
  report.nullOriginActiveFinal = nullFinal;

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
