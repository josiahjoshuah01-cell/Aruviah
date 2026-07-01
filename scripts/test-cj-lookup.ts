/**
 * Verify CJ pid/SKU lookup paths (no DB insert unless --stage).
 * Usage: npx tsx scripts/test-cj-lookup.ts
 *        npx tsx scripts/test-cj-lookup.ts --stage electronics
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  classifyCjIdentifier,
  fetchCjProductForLookup,
  runCjLookup,
} from "../lib/cj-lookup";
import { getCjAccessToken } from "../lib/cj-staging";

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

const TEST_PID = "2606270658351616600";
const TEST_SKU = "CJYP2957751";

async function main() {
  loadEnvLocal();
  const apiKey = process.env.CJ_API_KEY?.trim();
  if (!apiKey) throw new Error("CJ_API_KEY missing");

  console.log("classify pid:", classifyCjIdentifier(TEST_PID));
  console.log("classify sku:", classifyCjIdentifier(TEST_SKU));

  const token = await getCjAccessToken(apiKey);
  const headers = {
    "CJ-Access-Token": token,
    "Content-Type": "application/json",
  };

  for (const id of [TEST_PID, TEST_SKU]) {
    console.log(`\n--- fetch lookup: ${id} ---`);
    const result = await fetchCjProductForLookup(id, headers);
    if (!result) {
      console.log("NOT FOUND");
      continue;
    }
    console.log("method:", result.method);
    console.log("title:", result.product.detail.productNameEn);
    console.log("pid:", result.product.detail.pid);
    console.log("variants:", result.product.variants.length);
    console.log(
      "ships_from:",
      result.product.variants[0]?.inventories?.[0]?.countryCode ?? "n/a"
    );
  }

  const stageSlug = process.argv.find((a) => a !== "--stage")
    ? process.argv[process.argv.indexOf("--stage") + 1]
    : null;

  if (stageSlug) {
    console.log(`\n--- stage by SKU into ${stageSlug} ---`);
    const staged = await runCjLookup(TEST_SKU, stageSlug);
    console.log(staged.ok ? staged : staged.error);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
