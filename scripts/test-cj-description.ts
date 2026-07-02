/**
 * Show raw CJ description vs sanitized markdown for a probe sample or live pid.
 * Usage: npx tsx scripts/test-cj-description.ts [pid]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { sanitizeCjDescription } from "../lib/cj-description";
import { parseProductDescription } from "../lib/cj-description";

const samplePath = join(__dirname, "cj-description-probe-sample.json");

async function fetchLive(pid: string) {
  const { cjGet } = await import("../lib/cj-api");
  const data = await cjGet<{ description?: string; productNameEn?: string; categoryName?: string }>(
    "/product/query",
    { pid }
  );
  return data;
}

async function main() {
  const pid = process.argv[2];

  let raw: string;
  let title: string;
  let category: string | undefined;

  if (pid) {
    console.log(`Fetching live product ${pid}...\n`);
    const data = await fetchLive(pid);
    raw = data.description ?? "";
    title = data.productNameEn ?? "Product";
    category = data.categoryName;
  } else {
    const sample = JSON.parse(readFileSync(samplePath, "utf8")) as {
      description: string;
      productNameEn: string;
    };
    raw = sample.description;
    title = sample.productNameEn;
    console.log(`Using probe sample: ${sample.productNameEn}\n`);
  }

  console.log("=== RAW CJ description field ===\n");
  console.log(raw);
  console.log("\n=== CLEANED (stored in staged_products.description) ===\n");
  const cleaned = sanitizeCjDescription(raw, title, category);
  console.log(cleaned);
  console.log("\n=== PARSED SECTIONS (product page render) ===\n");
  const sections = parseProductDescription(cleaned);
  for (const s of sections) {
    if (s.heading) console.log(`[${s.heading}]`);
    for (const p of s.paragraphs) console.log(`  ${p}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
