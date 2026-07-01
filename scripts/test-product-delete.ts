/**
 * Verify product/variant delete vs deactivate rules.
 * Usage: npx tsx scripts/test-product-delete.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);

  const { hardDeleteProduct, hardDeleteVariant } = await import(
    "../lib/admin-products"
  );

  // --- Test 1: hard delete product with zero orders ---
  const { data: victim } = await sb
    .from("products")
    .insert({
      title: "DELETE-TEST-NO-ORDERS",
      is_active: true,
    })
    .select("id")
    .single();

  if (!victim) throw new Error("Failed to create test product");

  const { data: victimVariant } = await sb
    .from("product_variants")
    .insert({
      product_id: victim.id,
      sku: "TEST-DEL-001",
      price_usd: 1,
      stock: 5,
      is_active: true,
    })
    .select("id")
    .single();

  console.log("\n=== TEST 1: Hard delete (no order history) ===");
  console.log("BEFORE product id:", victim.id);
  const del1 = await hardDeleteProduct(victim.id);
  console.log("ACTION result:", JSON.stringify(del1));
  const { data: gone } = await sb
    .from("products")
    .select("id")
    .eq("id", victim.id)
    .maybeSingle();
  console.log("AFTER product exists:", !!gone);
  console.log(del1.ok && !gone ? "PASS" : "FAIL");

  // --- Test 2: block delete when order history exists ---
  const { data: protectedProduct } = await sb
    .from("products")
    .insert({
      title: "DELETE-TEST-WITH-ORDERS",
      is_active: true,
    })
    .select("id")
    .single();

  if (!protectedProduct) throw new Error("Failed to create protected product");

  const { data: protectedVariant } = await sb
    .from("product_variants")
    .insert({
      product_id: protectedProduct.id,
      sku: "TEST-DEL-002",
      price_usd: 2,
      stock: 3,
      is_active: true,
    })
    .select("id")
    .single();

  if (!protectedVariant) throw new Error("Failed to create protected variant");

  const userId = (
    await sb.auth.admin.listUsers({ perPage: 1 })
  ).data.users[0]?.id;
  if (!userId) throw new Error("No auth user for test order");

  const { data: testOrder } = await sb
    .from("orders")
    .insert({
      user_id: userId,
      total: 2,
      currency: "USD",
      status: "paid",
      paypal_order_id: `TEST-DEL-${Date.now()}`,
      shipping: {
        firstName: "Test",
        lastName: "Buyer",
        address: "1 Test St",
        city: "Austin",
        country: "US",
        phone: "555-0100",
      },
    })
    .select("id")
    .single();

  if (!testOrder) throw new Error("Failed to create test order");

  await sb.from("order_items").insert({
    order_id: testOrder.id,
    variant_id: protectedVariant.id,
    qty: 1,
    price: 2,
  });

  console.log("\n=== TEST 2: Block delete (has order history) ===");
  console.log("BEFORE product id:", protectedProduct.id);
  const del2 = await hardDeleteProduct(protectedProduct.id);
  console.log("ACTION result:", JSON.stringify(del2));
  const { data: stillThere } = await sb
    .from("products")
    .select("id, is_active")
    .eq("id", protectedProduct.id)
    .single();
  console.log("AFTER product exists:", !!stillThere, "is_active:", stillThere?.is_active);
  console.log(
    !del2.ok && del2.requiresDeactivate && stillThere
      ? "PASS"
      : "FAIL"
  );

  // cleanup test artifacts
  await sb.from("order_items").delete().eq("order_id", testOrder.id);
  await sb.from("orders").delete().eq("id", testOrder.id);
  await sb.from("product_variants").delete().eq("id", protectedVariant.id);
  await sb.from("products").delete().eq("id", protectedProduct.id);
  console.log("\nCleaned up test order + protected product.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
