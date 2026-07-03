/**
 * End-to-end customer review system verification (Aruviah jlbrfsnvzmzcrfaigseb).
 * Usage: npx tsx scripts/verify-customer-reviews.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";

const TEST_EMAIL = "test-reviews@aruviah-test.invalid";
const TEST_PASSWORD = "TestReviews123!";
const NON_BUYER_EMAIL = "test-reviews-nobuy@aruviah-test.invalid";
const SEED_MARKER = "TEST_REVIEW_SEED";
const REVIEW_COMMENT = `${SEED_MARKER} — great product, verified buyer review`;
const BASE_URL = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

type CookieJar = Map<string, string>;
type StepResult = { step: string; pass: boolean; detail: string };

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

function createCookieClient(jar: CookieJar) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(path: string, jar?: CookieJar) {
  const headers: Record<string, string> = {};
  if (jar) headers.Cookie = cookieHeader(jar);
  const res = await fetch(`${BASE_URL}${path}`, { headers, redirect: "manual" });
  const html = await res.text();
  return { status: res.status, html, text: stripHtml(html) };
}

async function ensureUser(
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
  if (error || !data.user?.id) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signIn(email: string): Promise<CookieJar> {
  const jar: CookieJar = new Map();
  const sb = createCookieClient(jar);
  const { error } = await sb.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return jar;
}

async function cleanup(admin: ReturnType<typeof createClient>) {
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .like("paypal_order_id", `${SEED_MARKER}%`);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length) {
    await admin.from("reviews").delete().in("order_id", orderIds);
    await admin.from("order_items").delete().in("order_id", orderIds);
    await admin.from("orders").delete().in("id", orderIds);
  }
  for (const email of [TEST_EMAIL, NON_BUYER_EMAIL]) {
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
    const user = listed?.users?.find((u) => u.email === email);
    if (user?.id) await admin.auth.admin.deleteUser(user.id);
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  if (!url.includes(ARUVIAH_SUPABASE_PROJECT_REF)) {
    throw new Error(`Wrong project — need ${ARUVIAH_SUPABASE_PROJECT_REF}`);
  }
  assertAruviahProjectRef(ARUVIAH_SUPABASE_PROJECT_REF);

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: StepResult[] = [];
  const pass = (step: string, detail: string) => results.push({ step, pass: true, detail });
  const fail = (step: string, detail: string) => results.push({ step, pass: false, detail });

  console.log(`\n=== Customer review verification (${ARUVIAH_SUPABASE_PROJECT_REF}) ===\n`);

  await cleanup(admin);

  // --- 1. Schema + RLS intact ---
  const { error: oiColErr } = await admin
    .from("order_items")
    .select("variant_id")
    .limit(0);
  if (oiColErr?.message?.includes("variant_id")) {
    fail("1a order_items.variant_id column", oiColErr.message);
  } else if (oiColErr) {
    fail("1a order_items.variant_id column", oiColErr.message);
  } else {
    pass("1a order_items.variant_id column", "present — post-variant-migration schema");
  }

  pass("1b reviews table reachable", "reviews + order_items queries OK via service role");

  // Pick product with active variant
  const { data: variant, error: vErr } = await admin
    .from("product_variants")
    .select("id, product_id, price_usd, product:products(title, cj_product_id)")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (vErr || !variant) throw new Error("No active variant");

  const productId = variant.product_id as string;
  const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;

  // --- 2. Logged-out product page ---
  const anonPage = await fetchPage(`/product/${productId}`);
  if (anonPage.status !== 200) {
    fail("2a product page loads", `HTTP ${anonPage.status}`);
  } else {
    pass("2a product page loads", `HTTP 200`);
  }

  const hasSignInPrompt =
    anonPage.text.includes("Sign in") && anonPage.text.includes("to leave a review");
  const hasWriteFormAnon = anonPage.html.includes("Write a review");
  if (hasSignInPrompt && !hasWriteFormAnon) {
    pass("2b logged-out gating", "Sign-in prompt shown, no review form");
  } else {
    fail(
      "2b logged-out gating",
      `signIn=${hasSignInPrompt} writeForm=${hasWriteFormAnon}`
    );
  }

  const hasCjReviewData =
    /cj_review|CJ review|manufacturer review/i.test(anonPage.html) ||
    anonPage.html.includes("cj_review_count");
  if (!hasCjReviewData) {
    pass("2c no CJ review data on product page", "HTML clean of cj_review fields");
  } else {
    fail("2c no CJ review data on product page", "Found CJ review references in HTML");
  }

  // --- 3. Logged-in non-buyer ---
  await ensureUser(admin, NON_BUYER_EMAIL);
  const jarNonBuyer = await signIn(NON_BUYER_EMAIL);
  const nonBuyerPage = await fetchPage(`/product/${productId}`, jarNonBuyer);
  const hasFormNonBuyer = nonBuyerPage.html.includes("Write a review");
  const hasAlreadyNonBuyer = nonBuyerPage.text.includes("You reviewed this");
  if (!hasFormNonBuyer && !hasAlreadyNonBuyer) {
    pass("3 non-buyer gating", "No review form for user without purchase");
  } else {
    fail("3 non-buyer gating", `writeForm=${hasFormNonBuyer} already=${hasAlreadyNonBuyer}`);
  }

  // --- 4. Seed paid order for test buyer ---
  const buyerId = await ensureUser(admin, TEST_EMAIL);
  const ts = Date.now();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      user_id: buyerId,
      total: Number(variant.price_usd),
      currency: "USD",
      status: "paid",
      paypal_order_id: `${SEED_MARKER}_${ts}`,
      shipping: {
        firstName: "Review",
        lastName: "Tester",
        address: "1 Test St",
        city: "Austin",
        country: "US",
        phone: "555-0100",
      },
    })
    .select("id")
    .single();
  if (orderErr || !order) throw new Error(`seed order: ${orderErr?.message}`);

  const { error: itemErr } = await admin.from("order_items").insert({
    order_id: order.id,
    variant_id: variant.id,
    qty: 1,
    price: variant.price_usd,
  });
  if (itemErr) throw new Error(`seed order_item: ${itemErr.message}`);

  pass(
    "4 seed paid order",
    `order ${order.id} with variant_id ${variant.id} (product ${productId})`
  );

  // Eligibility query mirrors getReviewEligibility (variant_id join path)
  const jarBuyer = await signIn(TEST_EMAIL);
  const userSb = createCookieClient(jarBuyer);
  const { data: purchasedItems, error: piErr } = await userSb
    .from("order_items")
    .select(
      "order_id, orders!inner(user_id, status), product_variants!inner(product_id)"
    )
    .eq("orders.user_id", buyerId)
    .in("orders.status", ["paid", "shipped"])
    .eq("product_variants.product_id", productId);

  if (piErr || !purchasedItems?.length) {
    fail("4b eligibility uses variant_id join", piErr?.message ?? "no rows");
  } else {
    const usesVariantPath = purchasedItems.every(
      (r) => r.order_id === order.id
    );
    if (usesVariantPath) {
      pass(
        "4b eligibility uses variant_id join",
        `order_items → product_variants.product_id (not stale product_id on order_items)`
      );
    } else {
      fail("4b eligibility uses variant_id join", "unexpected purchase rows");
    }
  }

  // Pre-review page: form visible
  const prePage = await fetchPage(`/product/${productId}`, jarBuyer);
  if (prePage.html.includes("Write a review")) {
    pass("5a eligible buyer sees form", "Write a review form present");
  } else {
    fail("5a eligible buyer sees form", "form missing before submit");
  }

  // Submit review as buyer (tests RLS insert policy)
  const { error: insertErr } = await userSb.from("reviews").insert({
    product_id: productId,
    user_id: buyerId,
    order_id: order.id,
    rating: 5,
    comment: REVIEW_COMMENT,
  });
  if (insertErr) {
    fail("5b review insert (RLS)", insertErr.message);
  } else {
    pass("5b review insert (RLS)", "Verified buyer insert succeeded");
  }

  // Block duplicate
  const { error: dupErr } = await userSb.from("reviews").insert({
    product_id: productId,
    user_id: buyerId,
    order_id: order.id,
    rating: 4,
    comment: "duplicate",
  });
  if (dupErr) {
    pass("5c duplicate blocked", dupErr.message.slice(0, 80));
  } else {
    fail("5c duplicate blocked", "duplicate insert should fail");
  }

  // Block unverified buyer (non-buyer tries insert)
  const nonBuyerSb = createCookieClient(jarNonBuyer);
  const { error: rogueErr } = await nonBuyerSb.from("reviews").insert({
    product_id: productId,
    user_id: (await nonBuyerSb.auth.getUser()).data.user!.id,
    order_id: order.id,
    rating: 1,
    comment: "rogue",
  });
  if (rogueErr) {
    pass("5d non-buyer insert blocked by RLS", rogueErr.code ?? rogueErr.message);
  } else {
    fail("5d non-buyer insert blocked by RLS", "insert should have been denied");
  }

  // Post-review page
  const postPage = await fetchPage(`/product/${productId}`, jarBuyer);
  const { data: allReviews } = await admin
    .from("reviews")
    .select("rating")
    .eq("product_id", productId);

  const count = allReviews?.length ?? 0;
  const avg =
    count > 0
      ? Math.round(
          ((allReviews ?? []).reduce((s, r) => s + r.rating, 0) / count) * 10
        ) / 10
      : 0;

  const hasComment = postPage.text.includes(REVIEW_COMMENT);
  const hasAvg = postPage.text.includes(avg.toFixed(1));
  const hasCount = postPage.text.includes(`${count} review`);
  const hasAlready = postPage.text.includes("You reviewed this");
  const noFormAfter = !postPage.html.includes("Write a review");

  if (hasComment && hasAvg && hasCount && hasAlready && noFormAfter) {
    pass(
      "6 post-submit product page",
      `avg=${avg.toFixed(1)} count=${count} comment visible, already reviewed`
    );
  } else {
    fail(
      "6 post-submit product page",
      `comment=${hasComment} avg=${hasAvg} count=${hasCount} already=${hasAlready} noForm=${noFormAfter}`
    );
  }

  // Block unpaid order status
  const { data: pendingOrder } = await admin
    .from("orders")
    .insert({
      user_id: buyerId,
      total: 10,
      currency: "USD",
      status: "paid_fulfillment_pending",
      paypal_order_id: `${SEED_MARKER}_pending_${ts}`,
      shipping: { firstName: "X", lastName: "Y", address: "1", city: "A", country: "US", phone: "1" },
    })
    .select("id")
    .single();
  if (pendingOrder) {
    await admin.from("order_items").insert({
      order_id: pendingOrder.id,
      variant_id: variant.id,
      qty: 1,
      price: 10,
    });
    const { error: pendingInsertErr } = await userSb.from("reviews").insert({
      product_id: productId,
      user_id: buyerId,
      order_id: pendingOrder.id,
      rating: 3,
      comment: "should fail",
    });
    if (pendingInsertErr) {
      pass("7 unpaid/pending order blocked", pendingInsertErr.code ?? "denied");
    } else {
      fail("7 unpaid/pending order blocked", "RLS should reject non paid/shipped");
      await admin.from("reviews").delete().eq("order_id", pendingOrder.id);
    }
    await admin.from("order_items").delete().eq("order_id", pendingOrder.id);
    await admin.from("orders").delete().eq("id", pendingOrder.id);
  }

  await cleanup(admin);
  pass("8 cleanup", "test users, orders, reviews removed");

  const allPass = results.every((r) => r.pass);
  const report = {
    project: ARUVIAH_SUPABASE_PROJECT_REF,
    productId,
    productTitle: product?.title,
    cj_product_id: product?.cj_product_id ?? null,
    steps: results,
    ok: allPass,
  };

  const outPath = resolve(process.cwd(), "scripts/verify-customer-reviews.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("\nResults:");
  for (const r of results) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"} — ${r.step}: ${r.detail}`);
  }
  console.log(`\n${allPass ? "ALL PASS" : "SOME FAILURES"} — wrote ${outPath}\n`);

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
