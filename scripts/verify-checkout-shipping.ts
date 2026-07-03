/**
 * Verify live CJ freightCalculate checkout shipping.
 * Usage: npx tsx scripts/verify-checkout-shipping.ts
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { calculateCheckoutShipping } from "../lib/checkout-shipping";
import { resolveCartItems } from "../lib/orders";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

  const report: Record<string, unknown> = { tests: [] as object[] };
  const log = (name: string, payload: object) => {
    const entry = { name, ...payload };
    (report.tests as object[]).push(entry);
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(payload, null, 2));
  };

  const { data: variants, error } = await sb
    .from("product_variants")
    .select(
      "id, sku, ships_from_country, cj_variant_id, is_active, product:products(title, is_active)"
    )
    .not("cj_variant_id", "is", null)
    .eq("is_active", true);

  if (error || !variants?.length) {
    throw new Error("No CJ-mapped active variants found");
  }

  const byOrigin = new Map<string, typeof variants>();
  for (const v of variants) {
    const origin = (v.ships_from_country ?? "CN").toUpperCase();
    const list = byOrigin.get(origin) ?? [];
    list.push(v);
    byOrigin.set(origin, list);
  }

  const usDestination = "United States";
  const origins = [...byOrigin.keys()];
  const shippableByOrigin = new Map<string, string>();

  for (const origin of origins) {
    for (const candidate of byOrigin.get(origin) ?? []) {
      const probe = await calculateCheckoutShipping(
        [{ variantId: candidate.id, qty: 1 }],
        usDestination
      );
      if (probe.ok) {
        shippableByOrigin.set(origin, candidate.id);
        break;
      }
      await sleep(1200);
    }
  }

  const firstShippableId = [...shippableByOrigin.values()][0];
  const shippableVariant = firstShippableId
    ? variants.find((v) => v.id === firstShippableId) ?? null
    : null;

  if (!shippableVariant) {
    log("single-origin cart → US", {
      ok: false,
      error: "No shippable CJ variant found for US destination",
    });
  } else {
    const singleCart = [{ variantId: shippableVariant.id, qty: 1 }];
    const singleResult = await calculateCheckoutShipping(
      singleCart,
      usDestination
    );
    log("single-origin cart → US", {
      variant: shippableVariant.sku,
      origin: shippableVariant.ships_from_country,
      ok: singleResult.ok,
      quote: singleResult.ok ? singleResult.quote : undefined,
      error: !singleResult.ok ? singleResult.error : undefined,
    });

    await sleep(1200);

    const resolved = await resolveCartItems(singleCart, usDestination);
    log("resolveCartItems uses live freight (not static shipping_cost_usd)", {
      ok: !("error" in resolved),
      subtotal: "error" in resolved ? undefined : resolved.subtotal,
      shippingTotal: "error" in resolved ? undefined : resolved.shippingTotal,
      total: "error" in resolved ? undefined : resolved.total,
      perItemShippingCost:
        "error" in resolved
          ? undefined
          : resolved.items.map((i) => i.shippingCost),
      error: "error" in resolved ? resolved.error : undefined,
    });
  }

  await sleep(1200);

  let mixedCart: { variantId: string; qty: number }[] | null = null;
  if (shippableByOrigin.size >= 2) {
    mixedCart = [...shippableByOrigin.values()].slice(0, 2).map((variantId) => ({
      variantId,
      qty: 1,
    }));
  } else if (shippableVariant) {
    mixedCart = [
      { variantId: shippableVariant.id, qty: 1 },
      { variantId: shippableVariant.id, qty: 2 },
    ];
  }

  if (mixedCart) {
    const mixedResult = await calculateCheckoutShipping(mixedCart, usDestination);
    const groupSum =
      mixedResult.ok
        ? mixedResult.quote.groups.reduce((s, g) => s + g.shippingUsd, 0)
        : null;
    log(
      shippableByOrigin.size >= 2
        ? "mixed-origin cart → US"
        : "multi-qty same-origin cart → US",
      {
        origins: [...shippableByOrigin.keys()],
        ok: mixedResult.ok,
        groupCount: mixedResult.ok ? mixedResult.quote.groups.length : 0,
        groups: mixedResult.ok ? mixedResult.quote.groups : undefined,
        shippingTotal: mixedResult.ok ? mixedResult.quote.shippingTotal : undefined,
        groupSumMatchesTotal:
          mixedResult.ok && groupSum != null
            ? Math.abs(groupSum - mixedResult.quote.shippingTotal) < 0.01
            : null,
        error: !mixedResult.ok ? mixedResult.error : undefined,
      }
    );
    await sleep(1200);
  }

  const unservableCart = shippableVariant
    ? [{ variantId: shippableVariant.id, qty: 1 }]
    : [{ variantId: variants[0].id, qty: 1 }];
  const unservableResult = await calculateCheckoutShipping(unservableCart, "KP");
  log("unservable destination (KP)", {
    ok: unservableResult.ok,
    error: !unservableResult.ok ? unservableResult.error : undefined,
    unshippableItems: !unservableResult.ok
      ? unservableResult.unshippableItems
      : undefined,
  });

  const outPath = resolve(process.cwd(), "scripts/verify-checkout-shipping.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
