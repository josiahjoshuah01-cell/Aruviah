/**
 * Report product_variants cost backfill status (Aruviah jlbrfsnvzmzcrfaigseb).
 * Usage: npx tsx scripts/report-cost-backfill.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";

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
    throw new Error(`Wrong Supabase project — expected ${ARUVIAH_SUPABASE_PROJECT_REF}`);
  }
  assertAruviahProjectRef(ARUVIAH_SUPABASE_PROJECT_REF);

  const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: variants, error } = await sb
    .from("product_variants")
    .select(
      "id, sku, cost_price_usd, cj_variant_id, product:products(cj_product_id, title)"
    );

  if (error) throw error;

  const withCost = (variants ?? []).filter((v) => v.cost_price_usd != null);
  const withoutCost = (variants ?? []).filter((v) => v.cost_price_usd == null);

  const cjLinked = withoutCost.filter((v) => {
    const p = Array.isArray(v.product) ? v.product[0] : v.product;
    return !!(p?.cj_product_id && v.cj_variant_id);
  });

  const placeholder = withoutCost.filter((v) => {
    const p = Array.isArray(v.product) ? v.product[0] : v.product;
    return !p?.cj_product_id;
  });

  console.log(
    JSON.stringify(
      {
        project: ARUVIAH_SUPABASE_PROJECT_REF,
        totalVariants: variants?.length ?? 0,
        withCost: withCost.length,
        withoutCost: withoutCost.length,
        withoutCostBreakdown: {
          cjLinkedStillNull: cjLinked.length,
          placeholderOrNoCjPid: placeholder.length,
        },
        sampleWithCost: withCost.slice(0, 3).map((v) => ({
          sku: v.sku,
          cost: v.cost_price_usd,
        })),
        sampleWithoutCost: withoutCost.slice(0, 5).map((v) => ({
          sku: v.sku,
          reason:
            (Array.isArray(v.product) ? v.product[0] : v.product)?.cj_product_id
              ? "no matching approved staged_products cost"
              : "placeholder / no cj_product_id",
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
