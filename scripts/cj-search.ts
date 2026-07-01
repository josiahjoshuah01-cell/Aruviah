/**
 * Stage a CJ product for admin review.
 * Usage: npm run cj:search -- "wireless earbuds" electronics
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { stageCjSearch } from "../lib/cj-staging";

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

function printSummary(
  rows: Array<{
    title: string;
    suggested_price_usd: number;
    variants: unknown[];
  }>
) {
  const titleW = Math.max(5, ...rows.map((r) => Math.min(r.title.length, 48)));
  console.log("");
  console.log(
    `${"Title".padEnd(titleW)}  ${"Price".padStart(8)}  Variants`
  );
  console.log(`${"-".repeat(titleW)}  ${"-".repeat(8)}  ${"-".repeat(8)}`);
  for (const row of rows) {
    const title =
      row.title.length > titleW
        ? `${row.title.slice(0, titleW - 1)}…`
        : row.title;
    console.log(
      `${title.padEnd(titleW)}  ${row.suggested_price_usd.toFixed(2).padStart(8)}  ${String(row.variants.length).padStart(8)}`
    );
  }
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const keyword = args[0];
  const categorySlug = args[1];

  if (!keyword || !categorySlug) {
    console.error('Usage: npm run cj:search -- "<keyword>" <category-slug>');
    console.error('Example: npm run cj:search -- "wireless earbuds" electronics');
    process.exit(1);
  }

  if (!process.env.CJ_API_KEY?.trim()) {
    throw new Error("CJ_API_KEY missing in .env.local");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env vars missing in .env.local");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const row = await stageCjSearch(
    supabase,
    keyword,
    categorySlug,
    process.env.CJ_API_KEY
  );

  console.log("\n=== CJ STAGED (pending review) ===");
  printSummary([row]);
  console.log(`\nReview at: ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/admin/staging`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
