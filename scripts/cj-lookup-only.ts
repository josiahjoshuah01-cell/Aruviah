import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchCjProductForLookup } from "../lib/cj-lookup";
import { getCjAccessToken } from "../lib/cj-staging";

const SKU = process.argv[2] ?? "CJYD258310312LO";

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
  const token = await getCjAccessToken(process.env.CJ_API_KEY!);
  const headers = {
    "CJ-Access-Token": token,
    "Content-Type": "application/json",
  };
  const r = await fetchCjProductForLookup(SKU, headers);
  console.log(
    JSON.stringify(
      r
        ? {
            method: r.method,
            pid: r.product.detail.pid,
            productSku: r.product.detail.productSku,
            title: r.product.detail.productNameEn,
            variants: r.product.variants.length,
          }
        : null,
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
