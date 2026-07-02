import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildFetchedCjProduct,
  buildStagedRow,
  getCjAccessToken,
  queryCjProductDetail,
} from "../lib/cj-staging";
import { fetchCjProductReviewSummary } from "../lib/cj-product-comments";

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
  const pid = process.argv[2] ?? "2070159544046288898";
  const persist = process.argv.includes("--persist");

  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  const token = await getCjAccessToken(apiKey);
  const headers = { "CJ-Access-Token": token, "Content-Type": "application/json" };

  const detail = await queryCjProductDetail(headers, "pid", pid);
  if (!detail) throw new Error("Product not found");

  const fetched = await buildFetchedCjProduct(headers, detail, null);
  if (!fetched) throw new Error("Could not enrich variants");

  const review = await fetchCjProductReviewSummary(headers, detail.pid);
  const row = buildStagedRow(
    fetched.detail,
    fetched.variants,
    fetched.coverImage,
    "00000000-0000-0000-0000-000000000000",
    `probe:${pid}`,
    fetched.listShippingCountryCodes,
    review
  );

  console.log("Product:", row.title);
  console.log(JSON.stringify({
    is_verified_warehouse: row.is_verified_warehouse,
    cj_review_count: row.cj_review_count,
    cj_review_avg_score: row.cj_review_avg_score,
    variants: row.variants.map((v) => ({
      color: v.color,
      is_verified_warehouse: v.is_verified_warehouse,
      ships_from_country: v.ships_from_country,
    })),
  }, null, 2));

  if (persist) {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: cat } = await sb.from("categories").select("id").eq("slug", "electronics").maybeSingle();
    if (!cat?.id) throw new Error("electronics category missing");
    row.suggested_category_id = cat.id;
    const { error } = await sb.from("staged_products").insert({ ...row, status: "pending" });
    if (error) throw error;
    console.log("\nInserted pending staged_products row.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
