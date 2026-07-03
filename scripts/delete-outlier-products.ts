/**
 * Verify and hard-delete outlier products ARV-00153 / ARV-00154.
 * Usage: npx tsx scripts/delete-outlier-products.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { hardDeleteProduct } from "../lib/admin-products";

const TARGET_SKUS = ["ARV-00153", "ARV-00154"];

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

  const { data: variants, error } = await sb
    .from("product_variants")
    .select(
      "id, sku, price_usd, product_id, product:products(id, title)"
    )
    .in("sku", TARGET_SKUS);

  if (error) throw error;
  if (!variants?.length) {
    console.log("No variants found for target SKUs — may already be deleted.");
    return;
  }

  console.log("=== Found variants ===");
  for (const v of variants) {
    const product = Array.isArray(v.product) ? v.product[0] : v.product;
    console.log(
      JSON.stringify({
        sku: v.sku,
        variant_id: v.id,
        product_id: v.product_id,
        title: product?.title,
        price_usd: v.price_usd,
      })
    );
  }

  const variantIds = variants.map((v) => v.id);
  const { data: orderItems, error: oiErr } = await sb
    .from("order_items")
    .select("id, order_id, variant_id, qty")
    .in("variant_id", variantIds);

  if (oiErr) throw oiErr;

  console.log("\n=== order_items referencing these variants ===");
  console.log(`Count: ${orderItems?.length ?? 0}`);
  if (orderItems?.length) {
    console.log(JSON.stringify(orderItems, null, 2));
    console.error("\nSTOP: order history exists — not deleting.");
    process.exit(1);
  }

  const productIds = [
    ...new Set(variants.map((v) => v.product_id as string)),
  ];
  console.log(`\n=== Hard delete ${productIds.length} product(s) ===`);

  for (const productId of productIds) {
    const result = await hardDeleteProduct(productId);
    if (!result.ok) {
      console.error(`Failed to delete product ${productId}:`, result);
      process.exit(1);
    }
    console.log(`Deleted product ${productId}`);
  }

  const { data: remaining } = await sb
    .from("product_variants")
    .select("id, sku")
    .in("sku", TARGET_SKUS);

  const { count: variantCount } = await sb
    .from("product_variants")
    .select("id", { count: "exact", head: true });

  console.log("\n=== Post-delete verification ===");
  console.log(`Remaining rows for target SKUs: ${remaining?.length ?? 0}`);
  console.log(`Total product_variants: ${variantCount}`);

  if ((remaining?.length ?? 0) > 0) {
    throw new Error("Target SKUs still present after delete");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
