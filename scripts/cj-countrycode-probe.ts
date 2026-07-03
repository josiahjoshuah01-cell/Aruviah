import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { getCjAccessToken } from "../lib/cj-staging";

const SKU = "CJYD258310312LO";
const BASE = "https://developers.cjdropshipping.com/api2.0/v1";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
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

async function get(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  return { url, status: res.status, body: await res.json() };
}

async function main() {
  loadEnvLocal();
  const token = await getCjAccessToken(process.env.CJ_API_KEY!);
  const headers = { "CJ-Access-Token": token, "Content-Type": "application/json" };
  const out: unknown[] = [];

  const urls = [
    `${BASE}/product/query?variantSku=${SKU}&countryCode=US`,
    `${BASE}/product/query?variantSku=${SKU}`,
    `${BASE}/product/variant/query?variantSku=${SKU}`,
    `${BASE}/product/variant/query?variantSku=${SKU}&countryCode=US`,
    `${BASE}/product/variant/query?productSku=CJYD2583103`,
    `${BASE}/product/variant/query?pid=2511060704591611100`,
    `${BASE}/product/stock/queryBySku?sku=${SKU}`,
  ];

  for (const url of urls) {
    await new Promise((r) => setTimeout(r, 1300));
    const r = await get(url, headers);
    const d = r.body.data;
    out.push({
      url: r.url.replace(BASE, ""),
      http: r.status,
      code: r.body.code,
      message: r.body.message,
      variantCount: Array.isArray(d?.variants) ? d.variants.length : Array.isArray(d) ? d.length : undefined,
      firstVariantSku: d?.variants?.[0]?.variantSku ?? d?.[0]?.variantSku,
      firstVid: d?.variants?.[0]?.vid ?? d?.[0]?.vid,
      stockSample: d,
    });
  }

  const file = resolve(process.cwd(), "scripts/cj-countrycode-probe.json");
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("written", file);
  for (const row of out) console.log(JSON.stringify(row));
}

main();
