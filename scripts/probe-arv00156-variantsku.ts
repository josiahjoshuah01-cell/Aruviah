/** Quick probe: ARV-00156 real CJ variantSku with/without countryCode */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getCJToken } from "../lib/cj";

const BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const VARIANT_SKU = "CJCJ296028002BY";
const VID = "2071774536144416770";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function get(path: string, token: string) {
  await new Promise((r) => setTimeout(r, 1200));
  const res = await fetch(`${BASE}${path}`, {
    headers: { "CJ-Access-Token": token },
  });
  const body = await res.json();
  const variants = body.data?.variants;
  const match = Array.isArray(variants)
    ? variants.find((v: { vid?: string }) => v.vid === VID)
    : null;
  return {
    path,
    code: body.code,
    message: body.message,
    variantCount: Array.isArray(variants) ? variants.length : 0,
    targetPresent: !!match,
    targetKey: match?.variantKey,
    productType: body.data?.productType,
  };
}

async function main() {
  loadEnv();
  const token = (await getCJToken())!;
  const rows = [
    await get(`/product/query?variantSku=${VARIANT_SKU}&countryCode=US`, token),
    await get(`/product/query?variantSku=${VARIANT_SKU}`, token),
    await get(`/product/variant/query?variantSku=${VARIANT_SKU}&countryCode=US`, token),
    await get(`/product/variant/query?variantSku=${VARIANT_SKU}`, token),
  ];
  console.log(JSON.stringify(rows, null, 2));
}

main();
