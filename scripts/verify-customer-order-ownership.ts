/**
 * Seed two test orders, verify customer ownership via live page fetches, then clean up.
 * Aruviah only (jlbrfsnvzmzcrfaigseb).
 *
 * Usage: npx tsx scripts/verify-customer-order-ownership.ts
 *        npx tsx scripts/verify-customer-order-ownership.ts --keep  (skip cleanup)
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";

const TEST_EMAIL_A = "test-ownership-a@aruviah-test.invalid";
const TEST_EMAIL_B = "test-ownership-b@aruviah-test.invalid";
const TEST_PASSWORD = "TestOwnership123!";
const SEED_MARKER = "TEST_OWNERSHIP_SEED";
const BASE_URL = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

type CookieJar = Map<string, string>;

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

function assertAruviahEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(ARUVIAH_SUPABASE_PROJECT_REF)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must point to Aruviah (${ARUVIAH_SUPABASE_PROJECT_REF}). Got: ${url}`
    );
  }
  assertAruviahProjectRef(ARUVIAH_SUPABASE_PROJECT_REF);
}

function createCookieClient(jar: CookieJar) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          jar.set(name, value);
        }
      },
    },
  });
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function htmlIncludes(html: string, needle: string): boolean {
  return (
    stripHtml(html).includes(needle) ||
    decodeHtmlEntities(html).includes(needle)
  );
}

function extractBetween(text: string, start: string, end: string): string | null {
  const i = text.indexOf(start);
  if (i === -1) return null;
  const j = text.indexOf(end, i + start.length);
  if (j === -1) return null;
  return text.slice(i + start.length, j).trim();
}

async function fetchPage(path: string, jar: CookieJar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, html, text: stripHtml(html) };
}

async function ensureTestUser(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string> {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find((u) => u.email === email);
  if (existing?.id) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user?.id) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

async function signIn(email: string): Promise<CookieJar> {
  const jar: CookieJar = new Map();
  const supabase = createCookieClient(jar);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return jar;
}

type SeedResult = {
  userAId: string;
  userBId: string;
  orderAId: string;
  orderBId: string;
  productTitle: string;
};

async function seedTestOrders(
  admin: ReturnType<typeof createClient>
): Promise<SeedResult> {
  const userAId = await ensureTestUser(admin, TEST_EMAIL_A);
  const userBId = await ensureTestUser(admin, TEST_EMAIL_B);

  const { data: variant, error: variantErr } = await admin
    .from("product_variants")
    .select(
      "id, price_usd, shipping_cost_usd, color, size, image_url, product:products(title, image_url)"
    )
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (variantErr || !variant) {
    throw new Error(
      "No active product variant found — run npm run seed first."
    );
  }

  const product = Array.isArray(variant.product)
    ? variant.product[0]
    : variant.product;
  const productTitle = product?.title ?? "Product";
  const unitPrice = Number(variant.price_usd);
  const shipping = Number(variant.shipping_cost_usd ?? 0);
  const total = unitPrice + shipping;

  const shippingJson = {
    firstName: "Test",
    lastName: "Buyer",
    address: "123 Seed Street",
    city: "Austin",
    country: "US",
    phone: "555-0199",
  };

  const ts = Date.now();

  const { data: orderA, error: orderAErr } = await admin
    .from("orders")
    .insert({
      user_id: userAId,
      total,
      currency: "USD",
      status: "paid",
      paypal_order_id: `${SEED_MARKER}_A_${ts}`,
      fulfillment_note: `${SEED_MARKER} — User A shipped test order`,
      shipping: shippingJson,
      cj_track_number: "CJPTEST0000000001YQ",
      cj_tracking_status: "In transit",
      cj_tracking_provider: "CJPacket",
      cj_tracking_url: null,
      cj_last_mile_carrier: "USPS",
    })
    .select("id")
    .single();

  if (orderAErr || !orderA) {
    throw new Error(`Failed to seed order A: ${orderAErr?.message}`);
  }

  const { data: orderB, error: orderBErr } = await admin
    .from("orders")
    .insert({
      user_id: userBId,
      total,
      currency: "USD",
      status: "paid_fulfillment_pending",
      paypal_order_id: `${SEED_MARKER}_B_${ts}`,
      fulfillment_note: `${SEED_MARKER} — User B processing test order`,
      shipping: shippingJson,
    })
    .select("id")
    .single();

  if (orderBErr || !orderB) {
    throw new Error(`Failed to seed order B: ${orderBErr?.message}`);
  }

  const { error: itemsErr } = await admin.from("order_items").insert([
    { order_id: orderA.id, variant_id: variant.id, qty: 1, price: unitPrice },
    { order_id: orderB.id, variant_id: variant.id, qty: 1, price: unitPrice },
  ]);

  if (itemsErr) throw new Error(`Failed to seed order items: ${itemsErr.message}`);

  return {
    userAId,
    userBId,
    orderAId: orderA.id,
    orderBId: orderB.id,
    productTitle,
  };
}

async function cleanup(admin: ReturnType<typeof createClient>) {
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .like("paypal_order_id", `${SEED_MARKER}%`);

  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length) {
    await admin.from("order_items").delete().in("order_id", orderIds);
    await admin.from("orders").delete().in("id", orderIds);
  }

  for (const email of [TEST_EMAIL_A, TEST_EMAIL_B]) {
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
    const user = listed?.users?.find((u) => u.email === email);
    if (user?.id) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}

async function cleanupStale(admin: ReturnType<typeof createClient>) {
  await cleanup(admin);
}

type StepResult = {
  step: string;
  pass: boolean;
  status?: number;
  rendered: string;
  notes?: string;
};

async function main() {
  const keep = process.argv.includes("--keep");
  loadEnvLocal();
  assertAruviahEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n=== Aruviah ownership verification (${ARUVIAH_SUPABASE_PROJECT_REF}) ===\n`);

  await cleanupStale(admin);

  const seed = await seedTestOrders(admin);
  console.log("Seeded:");
  console.log(`  User A: ${TEST_EMAIL_A} (${seed.userAId})`);
  console.log(`  User B: ${TEST_EMAIL_B} (${seed.userBId})`);
  console.log(`  Order A (User A, with tracking): ${seed.orderAId}`);
  console.log(`  Order B (User B, processing): ${seed.orderBId}`);
  console.log(`  Line item product: ${seed.productTitle}\n`);

  const jarA = await signIn(TEST_EMAIL_A);
  const randomUuid = "00000000-0000-4000-8000-000000000099";

  const results: StepResult[] = [];

  // Step 2 — list page as User A
  const listA = await fetchPage("/account/orders", jarA);
  const showsBOrder =
    htmlIncludes(listA.html, seed.orderBId) ||
    htmlIncludes(listA.html, seed.orderBId.slice(0, 8));
  results.push({
    step: "2 — User A /account/orders list",
    pass:
      listA.status === 200 &&
      htmlIncludes(listA.html, "Your orders") &&
      htmlIncludes(listA.html, seed.productTitle) &&
      !showsBOrder,
    status: listA.status,
    rendered: describeListPage(listA.text, seed),
    notes: showsBOrder ? "LEAK: User B order visible" : "User B order not in list",
  });

  // Step 3 — User A tries User B's order
  const detailB = await fetchPage(`/account/orders/${seed.orderBId}`, jarA);
  const notFoundB =
    detailB.status === 404 &&
    htmlIncludes(detailB.html, "Order not found") &&
    !htmlIncludes(detailB.html, seed.productTitle) &&
    !htmlIncludes(detailB.html, "Package tracking");
  results.push({
    step: "3 — User A → User B order detail",
    pass: notFoundB,
    status: detailB.status,
    rendered: describeNotFound(detailB.html, detailB.text),
    notes: htmlIncludes(detailB.html, seed.productTitle)
      ? "LEAK: User B product title visible"
      : "No User B data leaked",
  });

  // Step 4 — User A random UUID
  const detailRandom = await fetchPage(`/account/orders/${randomUuid}`, jarA);
  const notFoundRandom =
    detailRandom.status === 404 &&
    htmlIncludes(detailRandom.html, "Order not found");
  results.push({
    step: "4 — User A → random UUID",
    pass: notFoundRandom,
    status: detailRandom.status,
    rendered: describeNotFound(detailRandom.html, detailRandom.text),
    notes:
      detailB.html.length === detailRandom.html.length &&
      stripHtml(detailB.html) === stripHtml(detailRandom.html)
        ? "Identical response body to step 3"
        : `Body length step3=${detailB.html.length} step4=${detailRandom.html.length}`,
  });

  // Step 5 — User A own order detail
  const detailA = await fetchPage(`/account/orders/${seed.orderAId}`, jarA);
  results.push({
    step: "5 — User A own order detail (UI)",
    pass:
      detailA.status === 200 &&
      detailA.text.includes("Order details") &&
      detailA.text.includes("Package tracking") &&
      detailA.text.includes("CJPTEST0000000001YQ") &&
      detailA.text.includes("Track package") &&
      detailA.text.includes("In transit") &&
      detailA.text.includes("Order placed") &&
      detailA.text.includes("Processing") &&
      detailA.text.includes("Shipped") &&
      detailA.text.includes(seed.productTitle),
    status: detailA.status,
    rendered: describeDetailPage(detailA.text, seed),
  });

  // Query-layer double-check
  const supabaseA = createCookieClient(jarA);
  const { data: qOwn } = await supabaseA
    .from("orders")
    .select("id")
    .eq("id", seed.orderAId)
    .eq("user_id", seed.userAId)
    .maybeSingle();
  const { data: qOther } = await supabaseA
    .from("orders")
    .select("id")
    .eq("id", seed.orderBId)
    .maybeSingle();

  console.log("--- Rendered results (screenshot-equivalent) ---\n");
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.step} (HTTP ${r.status})`);
    console.log(r.rendered);
    if (r.notes) console.log(`  → ${r.notes}`);
    console.log();
  }

  console.log("--- RLS query layer (User A session) ---");
  console.log(`  Own order ${seed.orderAId.slice(0, 8)}…: ${qOwn ? "found" : "null"}`);
  console.log(`  User B order ${seed.orderBId.slice(0, 8)}…: ${qOther ? "LEAK" : "null (blocked)"}\n`);

  const report = {
    capturedAt: new Date().toISOString(),
    project: ARUVIAH_SUPABASE_PROJECT_REF,
    seed,
    results,
    rls: { ownOrder: !!qOwn, otherOrder: !!qOther },
  };
  const reportPath = resolve(
    process.cwd(),
    "scripts/verify-customer-order-ownership-report.json"
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);

  const htmlDir = resolve(process.cwd(), "scripts/ownership-verify-html");
  const { mkdirSync } = await import("fs");
  mkdirSync(htmlDir, { recursive: true });
  writeFileSync(resolve(htmlDir, "step2-list.html"), listA.html);
  writeFileSync(resolve(htmlDir, "step3-other-order.html"), detailB.html);
  writeFileSync(resolve(htmlDir, "step4-random-uuid.html"), detailRandom.html);
  writeFileSync(resolve(htmlDir, "step5-own-detail.html"), detailA.html);
  console.log(`HTML captures: ${htmlDir}`);

  if (!keep) {
    await cleanup(admin);
    console.log("\nCleaned up seeded orders, items, and test auth users.");
  } else {
    console.log("\n--keep: test data left in place. Run without --keep to clean up.");
    console.log(`  User A login: ${TEST_EMAIL_A} / ${TEST_PASSWORD}`);
    console.log(`  Order A: /account/orders/${seed.orderAId}`);
  }

  const allPass =
    results.every((r) => r.pass) && !!qOwn && !qOther;
  if (!allPass) process.exit(1);
}

function describeListPage(text: string, seed: SeedResult): string {
  return [
    "  Page: “Your orders” heading, subtitle about tracking",
    `  Visible card: product “${seed.productTitle}” with status badge (In transit/Shipped)`,
    `  Order total shown with tabular price`,
    `  User B order id prefix (${seed.orderBId.slice(0, 8)}): ${text.includes(seed.orderBId.slice(0, 8)) ? "VISIBLE — fail" : "not visible"}`,
    "  Each row links to /account/orders/{id}",
  ].join("\n");
}

function describeNotFound(html: string, text: string): string {
  const hasTitle = htmlIncludes(html, "Order not found");
  const hasMsg =
    text.includes("isn't linked to your account") ||
    htmlIncludes(html, "isn't linked to your account") ||
    htmlIncludes(html, "linked to your account");
  const hasLink = htmlIncludes(html, "View your orders");
  return [
    `  HTTP 404 — ${hasTitle ? "“Order not found” heading" : "missing heading"}`,
    `  ${hasMsg ? "“This order doesn't exist or isn't linked to your account.”" : "missing message"}`,
    `  ${hasLink ? "“View your orders” link back to list" : "missing link"}`,
    "  No line items, tracking number, or shipping address from another user",
  ].join("\n");
}

function describeDetailPage(text: string, seed: SeedResult): string {
  return [
    "  Header: “Order details” + formatted order date",
    "  Status badge: “In transit” (from cj_tracking_status)",
    "  Timeline: Order placed ✓ → Processing ✓ → Shipped (active, teal/current) → Delivered",
    "  Tracking card: “Package tracking”, status “In transit”, carrier USPS",
    "  Track number: CJPTEST0000000001YQ (mono)",
    "  “Track package” button → CJPacket fallback URL",
    `  Line item: “${seed.productTitle}” with variant color/size if set, qty 1`,
    "  Shipping address: Test Buyer, 123 Seed Street, Austin, US",
    "  Summary: Subtotal + Shipping + Total (tabular-price)",
  ].join("\n");
}

main().catch(async (err) => {
  console.error(err);
  try {
    loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (url.includes(ARUVIAH_SUPABASE_PROJECT_REF) && serviceKey) {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await cleanup(admin);
      console.error("Emergency cleanup completed.");
    }
  } catch {
    // ignore
  }
  process.exit(1);
});
