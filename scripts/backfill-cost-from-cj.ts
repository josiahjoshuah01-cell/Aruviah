/**
 * Backfill product_variants.cost_price_usd from CJ queryByVid variantSellPrice.
 * Aruviah only. Usage: npx tsx scripts/backfill-cost-from-cj.ts [--dry-run]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  ARUVIAH_SUPABASE_PROJECT_REF,
  assertAruviahProjectRef,
} from "../lib/supabase/project";
import { getCJAccessToken } from "../lib/cj";
import { getAdminOverviewStats } from "../lib/admin-queries";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const CJ_QUERY_INTERVAL_MS = 1100;

type CJApiEnvelope<T> = {
  code: number;
  result: boolean;
  message: string;
  data?: T;
};

type CJVariantData = {
  vid?: string;
  variantSellPrice?: number | string;
  sellPrice?: number | string;
};

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

function parsePrice(value: number | string | undefined | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchVariantCost(
  token: string,
  vid: string
): Promise<
  | { ok: true; cost: number; raw: CJVariantData }
  | { ok: false; error: string; code?: number }
> {
  const url = `${CJ_API_BASE}/product/variant/queryByVid?vid=${encodeURIComponent(vid)}`;
  const res = await fetch(url, {
    headers: { "CJ-Access-Token": token },
  });
  const body = (await res.json()) as CJApiEnvelope<CJVariantData>;

  if (!res.ok || body.code !== 200 || !body.data) {
    return {
      ok: false,
      error: body.message || `CJ API error (code ${body.code})`,
      code: body.code,
    };
  }

  const cost =
    parsePrice(body.data.variantSellPrice) ?? parsePrice(body.data.sellPrice);
  if (cost == null) {
    return {
      ok: false,
      error: "CJ response missing variantSellPrice",
      code: body.code,
    };
  }

  return { ok: true, cost, raw: body.data };
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const listOnly = process.argv.includes("--list-only");

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
      "id, sku, price_usd, cost_price_usd, cj_variant_id, product:products(title)"
    )
    .is("cost_price_usd", null)
    .not("cj_variant_id", "is", null)
    .order("sku");

  if (error) throw error;

  const gap = (variants ?? []).map((v) => {
    const product = Array.isArray(v.product) ? v.product[0] : v.product;
    return {
      sku: v.sku,
      cj_variant_id: v.cj_variant_id as string,
      price_usd: Number(v.price_usd),
      title: product?.title ?? null,
      id: v.id,
    };
  });

  console.log("=== STEP 1: Gap list (cost_price_usd IS NULL, cj_variant_id IS NOT NULL) ===");
  console.log(`Count: ${gap.length}`);
  console.log(JSON.stringify(gap, null, 2));

  if (listOnly) return;

  const token = await getCJAccessToken();
  if (!token) throw new Error("CJ authentication failed — check CJ_API_KEY");

  const results: Array<{
    sku: string;
    cj_variant_id: string;
    price_usd: number;
    old_cost: null;
    new_cost_price_usd: number | null;
    status: "updated" | "skipped_negative_margin" | "skipped_api_error";
    margin_usd?: number;
    margin_pct?: number;
    error?: string;
    cj_code?: number;
  }> = [];

  const flagged: typeof results = [];
  const failed: typeof results = [];

  for (let i = 0; i < gap.length; i++) {
    const row = gap[i];
    if (i > 0) await sleep(CJ_QUERY_INTERVAL_MS);

    const fetched = await fetchVariantCost(token, row.cj_variant_id);
    if (!fetched.ok) {
      const entry = {
        sku: row.sku,
        cj_variant_id: row.cj_variant_id,
        price_usd: row.price_usd,
        old_cost: null as null,
        new_cost_price_usd: null,
        status: "skipped_api_error" as const,
        error: fetched.error,
        cj_code: fetched.code,
      };
      results.push(entry);
      failed.push(entry);
      console.warn(`[${row.sku}] CJ fetch failed: ${fetched.error}`);
      continue;
    }

    const cost = fetched.cost;
    const marginUsd = row.price_usd - cost;
    const marginPct =
      row.price_usd > 0 ? (marginUsd / row.price_usd) * 100 : null;

    if (cost > row.price_usd) {
      const entry = {
        sku: row.sku,
        cj_variant_id: row.cj_variant_id,
        price_usd: row.price_usd,
        old_cost: null as null,
        new_cost_price_usd: cost,
        status: "skipped_negative_margin" as const,
        margin_usd: Math.round(marginUsd * 100) / 100,
        margin_pct:
          marginPct != null ? Math.round(marginPct * 10) / 10 : undefined,
      };
      results.push(entry);
      flagged.push(entry);
      console.warn(
        `[${row.sku}] FLAGGED negative margin: price=$${row.price_usd} cost=$${cost}`
      );
      continue;
    }

    if (!dryRun) {
      const { error: updateError } = await sb
        .from("product_variants")
        .update({ cost_price_usd: cost })
        .eq("id", row.id);
      if (updateError) {
        const entry = {
          sku: row.sku,
          cj_variant_id: row.cj_variant_id,
          price_usd: row.price_usd,
          old_cost: null as null,
          new_cost_price_usd: cost,
          status: "skipped_api_error" as const,
          error: updateError.message,
        };
        results.push(entry);
        failed.push(entry);
        continue;
      }
    }

    results.push({
      sku: row.sku,
      cj_variant_id: row.cj_variant_id,
      price_usd: row.price_usd,
      old_cost: null,
      new_cost_price_usd: cost,
      status: "updated",
      margin_usd: Math.round(marginUsd * 100) / 100,
      margin_pct:
        marginPct != null ? Math.round(marginPct * 10) / 10 : undefined,
    });
    console.log(`[${row.sku}] null → $${cost} (margin ${marginPct?.toFixed(1)}%)`);
  }

  const { data: allVariants } = await sb
    .from("product_variants")
    .select("id, cost_price_usd, cj_variant_id");

  const withCost = (allVariants ?? []).filter((v) => v.cost_price_usd != null);
  const withoutCost = (allVariants ?? []).filter((v) => v.cost_price_usd == null);

  let overview = null;
  if (!dryRun) {
    overview = await getAdminOverviewStats();
  }

  const report = {
    project: ARUVIAH_SUPABASE_PROJECT_REF,
    dryRun,
    gapCount: gap.length,
    updated: results.filter((r) => r.status === "updated").length,
    flaggedNegativeMargin: flagged,
    apiFailures: failed,
    allResults: results,
    postBackfill: {
      totalVariants: allVariants?.length ?? 0,
      withCost: withCost.length,
      withoutCost: withoutCost.length,
      stillNull: withoutCost.map((v) => ({
        id: v.id,
        cj_variant_id: v.cj_variant_id,
        reason: v.cj_variant_id ? "fetch failed or negative margin" : "no cj_variant_id",
      })),
    },
    adminOverview: overview,
  };

  const outPath = resolve(process.cwd(), "scripts/backfill-cost-from-cj.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        updated: report.updated,
        flagged: flagged.length,
        failed: failed.length,
        withCost: report.postBackfill.withCost,
        withoutCost: report.postBackfill.withoutCost,
        adminOverview: overview,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
