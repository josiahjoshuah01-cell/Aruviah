/**
 * Backfill active product titles with sanitizeCjTitle().
 * Usage: npx tsx scripts/backfill-product-titles.ts [--dry-run]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  appendOriginalTitleToDescription,
  sanitizeCjTitle,
  cjTitleWasSanitized,
} from "../lib/cj-title";

for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const dryRun = process.argv.includes("--dry-run");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data: products, error } = await supabase
    .from("products")
    .select("id, title, description")
    .eq("is_active", true);

  if (error) throw error;

  let updated = 0;
  const samples: Array<{ before: string; after: string }> = [];

  for (const product of products ?? []) {
    const before = product.title ?? "";
    const after = sanitizeCjTitle(before);
    if (before === after && !cjTitleWasSanitized(before, after)) continue;

    const description = appendOriginalTitleToDescription(
      product.description ?? "",
      before,
      after
    );

    if (samples.length < 8) {
      samples.push({ before, after });
    }

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ title: after, description })
        .eq("id", product.id);

      if (updateError) throw updateError;
    }

    updated += 1;
  }

  console.log(
    dryRun
      ? `[dry-run] Would update ${updated} product(s)`
      : `Updated ${updated} product(s)`
  );

  console.log("\n=== Sample before / after ===\n");
  for (const s of samples) {
    console.log("BEFORE:", s.before);
    console.log("AFTER: ", s.after);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
