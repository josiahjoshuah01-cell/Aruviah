/**
 * Verify product_variants migration: 16 products × 1 variant, cart pricing.
 * Run: node scripts/verify-variant-cart.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRODUCT_SELECT = `
  id,
  title,
  image_url,
  variants:product_variants!inner(
    id,
    sku,
    price_usd,
    shipping_cost_usd,
    stock,
    cj_variant_id,
    is_active
  )
`;

async function main() {
  console.log("=== 1. Product + variant counts ===\n");

  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: variantCount } = await supabase
    .from("product_variants")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  console.log(`Active products: ${productCount}`);
  console.log(`Active variants: ${variantCount}`);

  console.log("\n=== 2. Sample product with default variant (listing query) ===\n");

  const { data: products, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("variants.is_active", true)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("Query error:", error);
    process.exit(1);
  }

  for (const p of products ?? []) {
    const v = p.variants?.[0];
    const lineTotal = Number(v.price_usd) + Number(v.shipping_cost_usd);
    console.log({
      product_id: p.id,
      title: p.title,
      variant_id: v?.id,
      sku: v?.sku,
      price_usd: v?.price_usd,
      shipping_cost_usd: v?.shipping_cost_usd,
      cart_line_total_qty1: lineTotal,
      stock: v?.stock,
      cj_variant_id: v?.cj_variant_id,
    });
  }

  console.log("\n=== 3. Simulate resolveCartItems for first variant ===\n");

  const first = products?.[0];
  const variantId = first?.variants?.[0]?.id;
  if (!variantId) {
    console.error("No variant found");
    process.exit(1);
  }

  const { data: resolved, error: resolveErr } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, price_usd, shipping_cost_usd, stock, sku, is_active, product:products(id, title, is_active)"
    )
    .eq("id", variantId)
    .single();

  if (resolveErr) {
    console.error("Resolve error:", resolveErr);
    process.exit(1);
  }

  const price = Number(resolved.price_usd);
  const shipping = Number(resolved.shipping_cost_usd);
  const qty = 1;
  const serverTotal = (price + shipping) * qty;

  console.log({
    variantId: resolved.id,
    productId: resolved.product_id,
    title: resolved.product?.title,
    qty,
    unit_price: price,
    unit_shipping: shipping,
    server_computed_total: serverTotal,
  });

  console.log("\n=== 4. Reviews RLS — insert without purchase (expect failure) ===\n");

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const fakeUserId = "00000000-0000-0000-0000-000000000001";
  const fakeOrderId = "00000000-0000-0000-0000-000000000002";

  const { error: reviewErr } = await anon.from("reviews").insert({
    product_id: first.id,
    user_id: fakeUserId,
    order_id: fakeOrderId,
    rating: 5,
    comment: "Should be blocked by RLS",
  });

  console.log("Anon insert (no auth session):", reviewErr?.message ?? "unexpected success");

  console.log(
    "\nPolicy behavior: INSERT requires auth.uid() = user_id AND a matching paid/shipped order " +
      "with order_items.variant_id → product_variants.product_id = reviews.product_id. " +
      "A logged-in user with zero qualifying orders gets RLS violation (42501) on insert."
  );

  console.log("\n=== 5. All 16 products variant coverage ===\n");

  const { data: all } = await supabase
    .from("products")
    .select("id, title, variants:product_variants(id)")
    .eq("is_active", true);

  const missing = (all ?? []).filter((p) => !p.variants?.length);
  console.log(
    missing.length === 0
      ? `OK — all ${all?.length} products have at least one variant`
      : `FAIL — ${missing.length} products missing variants:`,
    missing.map((p) => p.title)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
