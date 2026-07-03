/**
 * Probe CJ SKU lookup for CJYD258310312LO — mirrors lib/cj-lookup.ts paths.
 * Usage: npx tsx scripts/cj-sku-lookup-probe.ts [sku]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  classifyCjIdentifier,
  fetchCjProductForLookup,
} from "../lib/cj-lookup";
import { getCjAccessToken } from "../lib/cj-staging";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const CJ_QUERY_INTERVAL_MS = 1200;
const SKU = process.argv[2] ?? "CJYD258310312LO";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function rawGet(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const body = await res.json();
  return { httpStatus: res.status, url, body };
}

async function main() {
  loadEnvLocal();
  const classified = classifyCjIdentifier(SKU);
  console.log("=== classifyCjIdentifier ===");
  console.log(JSON.stringify(classified, null, 2));

  const token = await getCjAccessToken(process.env.CJ_API_KEY!);
  const headers = { "CJ-Access-Token": token, "Content-Type": "application/json" };

  const calls: Record<string, unknown>[] = [];

  await sleep(CJ_QUERY_INTERVAL_MS);
  // Step 2: direct productSku query
  const productSkuUrl = `${CJ_API_BASE}/product/query?productSku=${encodeURIComponent(SKU)}&countryCode=US`;
  const productSkuRes = await rawGet(productSkuUrl, headers);
  calls.push({ step: "GET product/query?productSku", ...productSkuRes });

  await sleep(CJ_QUERY_INTERVAL_MS);
  const variantSkuUrl = `${CJ_API_BASE}/product/query?variantSku=${encodeURIComponent(SKU)}&countryCode=US`;
  const variantSkuRes = await rawGet(variantSkuUrl, headers);
  calls.push({ step: "GET product/query?variantSku", ...variantSkuRes });

  await sleep(CJ_QUERY_INTERVAL_MS);
  const listUrl = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=10&productSku=${encodeURIComponent(SKU)}&countryCode=US`;
  const listRes = await rawGet(listUrl, headers);
  calls.push({ step: "GET product/list?productSku", ...listRes });

  await sleep(CJ_QUERY_INTERVAL_MS);
  const listVariant = await rawGet(
    `${CJ_API_BASE}/product/list?pageNum=1&pageSize=10&variantSku=${encodeURIComponent(SKU)}&countryCode=US`,
    headers
  );
  calls.push({ step: "GET product/list?variantSku", ...listVariant });

  await sleep(CJ_QUERY_INTERVAL_MS);
  const pidUrl = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(SKU)}&countryCode=US`;
  const pidRes = await rawGet(pidUrl, headers);
  calls.push({ step: "GET product/query?pid (wrong)", ...pidRes });

  console.log("\n=== Raw API responses (summarized) ===");
  for (const c of calls) {
    const body = c.body as { code?: number; message?: string; result?: boolean; data?: unknown };
    const data = body.data as Record<string, unknown> | undefined;
    console.log(`\n--- ${c.step} ---`);
    console.log(`URL: ${c.url}`);
    console.log(
      JSON.stringify(
        {
          httpStatus: c.httpStatus,
          code: body.code,
          message: body.message,
          result: body.result,
          pid: data?.pid,
          productSku: data?.productSku,
          productNameEn: data?.productNameEn,
          sellPrice: data?.sellPrice,
          variantCount: Array.isArray(data?.variants) ? data.variants.length : undefined,
          listCount: Array.isArray((data as { list?: unknown[] })?.list)
            ? (data as { list: unknown[] }).list.length
            : undefined,
        },
        null,
        2
      )
    );
  }

  console.log("\n=== fetchCjProductForLookup (app logic) ===");
  const fetched = await fetchCjProductForLookup(SKU, headers);
  console.log(
    fetched
      ? JSON.stringify(
          {
            method: fetched.method,
            pid: fetched.product.detail.pid,
            productSku: fetched.product.detail.productSku,
            title: fetched.product.detail.productNameEn,
            variantCount: fetched.product.variants.length,
          },
          null,
          2
        )
      : "null — lookup failed"
  );

  const outPath = resolve(process.cwd(), "scripts/cj-sku-lookup-probe.json");
  writeFileSync(
    outPath,
    JSON.stringify({ sku: SKU, classified, calls, fetched: fetched ? { method: fetched.method, pid: fetched.product.detail.pid } : null }, null, 2)
  );
  console.log(`\nFull raw bodies written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
